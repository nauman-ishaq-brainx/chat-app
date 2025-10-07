import { Module } from '@nestjs/common';
import { AiAgentController } from './ai-agent.controller';
import { AiAgentService } from './ai-agent.service';
import { EmailService } from './services/email.service';
import { CalendarService } from './services/calendar.service';
import { LangchainService } from './services/langchain.service';
import { TranscriptionService } from './services/transcription.service';
import { MessagesModule } from '../messages/messages.module';
import { UploadService } from '../messages/upload.service';
import { RagModule } from '../rag/rag.module';

@Module({
  imports: [MessagesModule, RagModule],
  controllers: [AiAgentController],
  providers: [AiAgentService, EmailService, CalendarService, LangchainService, TranscriptionService, UploadService],
  exports: [AiAgentService],
})
export class AiAgentModule {}
