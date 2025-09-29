// src/database/database.module.ts
import { Module } from '@nestjs/common';
import { Pool } from 'pg';

const pool = new Pool({
  user: 'postgres',
  host: 'localhost',
  database: 'chat_app',
  password: 'password',
  port: 5434, // matches your docker exposed port
});

@Module({
  providers: [
    {
      provide: 'PG_CONNECTION',
      useValue: pool,
    },
  ],
  exports: ['PG_CONNECTION'],
})
export class DatabaseModule {}
