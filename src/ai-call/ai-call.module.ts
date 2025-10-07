import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AiCallController } from './ai-call.controller';
import { EmailService } from '../ai-agent/services/email.service';
import { CalendarService } from '../ai-agent/services/calendar.service';

@Module({
  imports: [ConfigModule],
  controllers: [AiCallController],
  providers: [EmailService, CalendarService],
  exports: [],
})
export class AiCallModule {}


