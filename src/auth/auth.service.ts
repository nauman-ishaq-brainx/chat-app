import { ForbiddenException, Injectable, Inject } from '@nestjs/common';
import { SignupDto, LoginDto } from './dto';
import * as argon from 'argon2';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { Pool } from 'pg';

@Injectable()
export class AuthService {
  constructor(
    @Inject('PG_CONNECTION') private pool: Pool, // Postgres pool
    private jwt: JwtService,
    private config: ConfigService,
  ) {}

  async signup(dto: SignupDto) {
    // hash the password before saving
    const hash = await argon.hash(dto.password);

    try {
      const result = await this.pool.query(
        `INSERT INTO users (email, password, name)
         VALUES ($1, $2, $3)
         RETURNING id, email, name, created_at`,
        [dto.email, hash, dto.name || null],
      );

      return result.rows[0];
    } catch (error: any) {
      if (error.code === '23505') {
        throw new ForbiddenException('Email already in use');
      }
      throw error;
    }
  }

  async signin(dto: LoginDto) {
    const result = await this.pool.query(
      'SELECT * FROM users WHERE email = $1',
      [dto.email],
    );
    const user = result.rows[0];

    if (!user) {
      throw new ForbiddenException('Credentials incorrect');
    }

    // compare hashed password
    const pwMatches = await argon.verify(user.password, dto.password);
    if (!pwMatches) {
      throw new ForbiddenException('Credentials incorrect');
    }

    return {
      access_token: await this.signToken(user.id, user.email),
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
      },
    };
  }

  async signToken(userId: number, email: string): Promise<string> {
    const payload = { sub: userId, email };
    const secret = this.config.get('JWT_SECRET');

    return this.jwt.signAsync(payload, {
      expiresIn: '1h',
      secret,
    });
  }
}
