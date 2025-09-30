import { Inject, Injectable } from '@nestjs/common';
import { Pool } from 'pg';

@Injectable()
export class UsersService {

    constructor(
        @Inject('PG_CONNECTION') private readonly pool: Pool,
    ) {}
        async findAll() {
            const result = await this.pool.query('SELECT * FROM users');
            return result.rows;
          }

        async getMe(userId: number) {
            const result = await this.pool.query(
                'SELECT id, email, name, created_at FROM users WHERE id = $1',
                [userId]
            );
            
            if (result.rows.length === 0) {
                throw new Error('User not found');
            }
            
            return result.rows[0];
        }
    
}
