import { Body, Controller, Delete, Get, Param, ParseIntPipe, Post, UseGuards, UseInterceptors, UploadedFile } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { MessagesService } from './messages.service';
import { AuthGuard } from '@nestjs/passport';
import { GetUser } from 'src/auth/decorator';

@Controller('messages')
@UseGuards(AuthGuard('jwt'))
export class MessagesController {
  constructor(private readonly messagesService: MessagesService) {}

  @Post()
  @UseInterceptors(FileInterceptor('file'))
  async sendMessage(
    @GetUser('id') userId: number,           // ✅ comes from JWT of the logged-in user
    @Body() body: { conversationId?: number; recipientId?: number; content: string },
    @UploadedFile() file?: Express.Multer.File,
  ) {
    return this.messagesService.sendMessage(userId, body, file);
  }

  @Get(':id')
  async getMessages(
    @GetUser('id') userId: number,           // ✅ comes from JWT of the logged-in user
    @Param('id', ParseIntPipe) conversationId: number,
  ) {
    return this.messagesService.getMessages(userId, conversationId);
  }
  @Delete(':id')
  async deleteMessage(
    @GetUser('id') userId: number,           // ✅ comes from JWT of the logged-in user
    @Param('id', ParseIntPipe) messageId: number,
  ) {
    return this.messagesService.deleteMessage(messageId, userId);
  }

}
