import { Module } from '@nestjs/common';
import { RagController } from './rag.controller';
import { RagService } from 'src/rag/rag.service';
import { ConfigModule } from '@nestjs/config';

@Module({
  imports: [ConfigModule],
  controllers: [RagController],
  providers: [RagService],
  exports: [RagService],
})
export class RagModule {}


