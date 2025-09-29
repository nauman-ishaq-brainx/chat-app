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
    
}
