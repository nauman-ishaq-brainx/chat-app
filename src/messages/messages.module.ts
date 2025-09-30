import { Module } from '@nestjs/common';
import { MessagesController } from './messages.controller';
import { MessagesService } from './messages.service';
import { MessagesGateway } from './messages.gateway';
import { DatabaseModule } from 'src/database/database.module';

@Module({
  imports: [DatabaseModule],
  controllers: [MessagesController],
  providers: [MessagesService, MessagesGateway]
})
export class MessagesModule {}
