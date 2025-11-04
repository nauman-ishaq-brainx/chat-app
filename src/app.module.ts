import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { UsersModule } from './users/users.module';
import { DatabaseModule } from './database/database.module';
import { AuthModule } from './auth/auth.module';
import { ConfigModule } from '@nestjs/config';
import { ConversationsModule } from './conversations/conversations.module';
import { MessagesModule } from './messages/messages.module';
import { RagModule } from './rag/rag.module';
import { AiCallModule } from './ai-call/ai-call.module';
import { AiAgentModule } from './ai-agent/ai-agent.module';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { APP_GUARD } from '@nestjs/core';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    ThrottlerModule.forRoot([{
      ttl: 30000, // Time window in milliseconds (1 minute)
      limit: 5, // Maximum number of requests per time window
    }]),
    UsersModule, 
    DatabaseModule, 
    AuthModule, 
    ConversationsModule, 
    MessagesModule, 
    RagModule,
    AiCallModule,
    AiAgentModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
  ],
})
export class AppModule {}
