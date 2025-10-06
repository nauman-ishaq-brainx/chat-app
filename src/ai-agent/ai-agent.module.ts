import { Module } from '@nestjs/common';
import { AiAgentController } from './ai-agent.controller';
import { AiAgentService } from './ai-agent.service';
import { EmailService } from './services/email.service';
import { CalendarService } from './services/calendar.service';
import { LangchainService } from './services/langchain.service';
import { MessagesModule } from '../messages/messages.module';

@Module({
  imports: [MessagesModule],
  controllers: [AiAgentController],
  providers: [AiAgentService, EmailService, CalendarService, LangchainService],
  exports: [AiAgentService],
})
export class AiAgentModule {}
