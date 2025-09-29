import { Controller, Post, Get, Param, Body, UseGuards, Query } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ConversationsService } from './conversations.service';
import { GetUser } from '../auth/decorator';

@Controller('conversations')
@UseGuards(AuthGuard('jwt')) // applies to all routes in this controller
export class ConversationsController {
  constructor(private conversationsService: ConversationsService) {}
  @Post()
createConversation(
  @GetUser('id') userId: number,           // ✅ comes from JWT of the logged-in user
  @Body() body: { name?: string; memberIds: number[] }
) {
  return this.conversationsService.createConversation(userId, body);
}

  @Get()
getUserConversations(@GetUser('id') userId: number, @Query('type') type?: 'dm' | 'group') {
  // type is optional
  // if type='dm' => fetch only private conversations
  // if type='group' => fetch only group conversations
  return this.conversationsService.getUserConversations(userId, type);
}

  @Get(':id/members')
  getConversationMembers(@GetUser('id') userId: number, @Param('id') id: number) {
    return this.conversationsService.getConversationMembers(id, userId);
  }

  @Post(':id/members')
  addMember(@GetUser('id') requestingUserId: number, @Param('id') id: number, @Body('userId') userId: number) {
    return this.conversationsService.addMember(requestingUserId, id, userId);
  }
}
