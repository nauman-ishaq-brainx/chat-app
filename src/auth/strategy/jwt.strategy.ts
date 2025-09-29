import { Injectable, UnauthorizedException, Inject } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { PassportStrategy } from "@nestjs/passport";
import { ExtractJwt, Strategy } from "passport-jwt";
import { Pool } from "pg";

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, 'jwt') {
  constructor(
    config: ConfigService,
    @Inject('PG_CONNECTION') private pool: Pool,   // 👈 use Postgres pool
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: config.get('JWT_SECRET'),
    });
  }

  async validate(payload: { sub: number; email: string }) {
    // Query user from Postgres
    const result = await this.pool.query(
      'SELECT id, email, password FROM users WHERE id = $1',
      [payload.sub],
    );
    if (result.rows.length === 0) {
      throw new UnauthorizedException('User not found');
    }

    const user = result.rows[0];
    // Remove password hash before returning
    const { password, ...userWithoutHash } = user;

    return userWithoutHash;
  }
}
