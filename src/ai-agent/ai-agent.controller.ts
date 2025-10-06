import { Controller, Post, Body, UseGuards, Request } from '@nestjs/common';
import { AiAgentService } from './ai-agent.service';
import { AiChatDto } from './dto/ai-chat.dto';
import { jwtGuard } from '../auth/guard/jwtGuard';

@Controller('ai-agent')
@UseGuards(jwtGuard)
export class AiAgentController {
  constructor(private readonly aiAgentService: AiAgentService) {}

  @Post('chat')
  async chat(@Body() aiChatDto: AiChatDto, @Request() req) {
    // Supports both scenarios:
    // 1. Existing conversation: provide conversationId
    // 2. New conversation: provide recipientId (AI agent ID)
    const userId = req.user.id;
    
    const result = await this.aiAgentService.processMessage(
      aiChatDto.message,
      aiChatDto.conversationId,
      userId,
      aiChatDto.recipientId,
    );

    return {
      success: result.success,
      aiResponse: result.aiResponse,
      messageId: result.messageId,
      conversationId: result.conversationId,
    };
  }
}
