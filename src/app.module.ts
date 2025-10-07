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

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    UsersModule, 
    DatabaseModule, 
    AuthModule, 
    ConversationsModule, 
    MessagesModule, 
    RagModule,
    AiCallModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
