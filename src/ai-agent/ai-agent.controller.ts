import { Controller, Post, Body, UseGuards, Request, UseInterceptors, UploadedFile } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { AiAgentService } from './ai-agent.service';
import { AiChatDto } from './dto/ai-chat.dto';
import { TranscriptionService } from './services/transcription.service';
import { jwtGuard } from '../auth/guard/jwtGuard';

@Controller('ai-agent')
@UseGuards(jwtGuard)
export class AiAgentController {
  constructor(
    private readonly aiAgentService: AiAgentService,
    private readonly transcriptionService: TranscriptionService,
  ) {}

  @Post('chat')
  @UseInterceptors(FileInterceptor('file'))
  async chat(
    @Body() aiChatDto: AiChatDto, 
    @Request() req,
    @UploadedFile() file?: Express.Multer.File,
  ) {
    // Supports both scenarios:
    // 1. Existing conversation: provide conversationId
    // 2. New conversation: provide recipientId (AI agent ID)
    const userId = req.user.id;
    
    let message: string;
    let transcription: string | undefined;
    
    // If a file is attached, transcribe it and ignore the message field
    if (file) {
      // Validate file type for audio files
      const allowedAudioTypes = ['audio/mpeg', 'audio/wav', 'audio/mp4', 'audio/ogg', 'audio/flac'];
      if (allowedAudioTypes.includes(file.mimetype)) {
        try {
          transcription = await this.transcriptionService.transcribeAudio(
            file.buffer,
            file.originalname,
          );
          message = transcription; // Use only transcription, ignore text message
         } catch (error) {
           return {
             success: false,
             error: 'Failed to transcribe audio file. Please try again.'
           };
         }
       } else {
         return {
           success: false,
           error: 'Invalid file type. Only audio files are supported for transcription.'
         };
       }
    } else {
      // No file attached, use the message field
       if (!aiChatDto.message || !aiChatDto.message.trim()) {
         return {
           success: false,
           error: 'Either a message or an audio file is required.'
         };
       }
      message = aiChatDto.message;
    }
    
    const result = await this.aiAgentService.processMessage(
      message,
      aiChatDto.conversationId,
      userId,
      aiChatDto.recipientId,
      file, // Pass the file to the service for saving
      !!file, // Pass true if file exists (voice message)
    );

    return {
      success: result.success,
      aiResponse: result.aiResponse,
      messageId: result.messageId,
      conversationId: result.conversationId,
      transcription: transcription, // Include transcription if voice message
      audioResponseUrl: result.audioResponseUrl, // Include audio response URL if voice message
    };
  }

}
