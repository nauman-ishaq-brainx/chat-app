import { Injectable, Logger } from '@nestjs/common';
import { LangchainService } from './services/langchain.service';
import { MessagesService } from '../messages/messages.service';
import { TranscriptionService } from './services/transcription.service';
import { UploadService } from '../messages/upload.service';

@Injectable()
export class AiAgentService {
  private readonly logger = new Logger(AiAgentService.name);
  private readonly AI_AGENT_USER_ID = parseInt(process.env.AI_AGENT_ID || '1');

  constructor(
    private readonly langchainService: LangchainService,
    private readonly messagesService: MessagesService,
    private readonly transcriptionService: TranscriptionService,
    private readonly uploadService: UploadService,
  ) {
    if (!this.AI_AGENT_USER_ID || isNaN(this.AI_AGENT_USER_ID)) {
      this.logger.error('AI_AGENT_ID environment variable is not set or invalid. Using default ID: 1');
    }
    this.logger.log(`AI Agent initialized with ID: ${this.AI_AGENT_USER_ID}`);
  }

  async processMessage(message: string, conversationId: number | undefined, userId: number, recipientId?: number, file?: Express.Multer.File, isVoiceMessage: boolean = false) {
    try {
      // Validate that either conversationId or recipientId is provided
      if (!conversationId && !recipientId) {
        throw new Error('Either conversationId or recipientId must be provided.');
      }

      // Validate that recipientId is the AI agent (if provided)
      if (recipientId && recipientId !== this.AI_AGENT_USER_ID) {
        throw new Error('Invalid recipient. Messages can only be sent to the AI agent.');
      }

      this.logger.log(`Processing message from user ${userId} to agent ${this.AI_AGENT_USER_ID} in conversation ${conversationId || 'new'}`);
      
      // Get conversation history (empty if new conversation)
      const conversationHistory = conversationId ? await this.getConversationHistory(conversationId) : [];
      
      // Add the new user message to the history
      const userMessage = {
        role: 'user',
        content: message,
      };
      
      const messageHistory = [...conversationHistory, userMessage];

      // Process through AI agent
      const aiResponse = await this.langchainService.runAgent(messageHistory, userId);

      // Save the user message with agent as recipient
      this.logger.log(`Saving user message from ${userId} to agent ${this.AI_AGENT_USER_ID}`);
      const userMessageResult = await this.messagesService.sendMessage(userId, {
        content: message,
        conversationId,
        recipientId: this.AI_AGENT_USER_ID,
      }, file);

      // Get the resolved conversation ID (in case a new conversation was created)
      const resolvedConversationId = userMessageResult.conversationId;

      // Save the AI response with user as recipient
      this.logger.log(`Saving AI response from agent ${this.AI_AGENT_USER_ID} to user ${userId}`);
      
      let aiResponseFile: Express.Multer.File | undefined;
      let audioResponseUrl: string | undefined;

      // If this was a voice message, generate voice response
      if (isVoiceMessage) {
        try {
          this.logger.log('Generating voice response for AI agent');
          const audioBuffer = await this.transcriptionService.textToSpeech(
            aiResponse.content,
            'alloy' // You can make this configurable
          );

          // Create a file object for upload
          const audioFileName = `ai_response_${Date.now()}.mp3`;
          aiResponseFile = {
            fieldname: 'file',
            originalname: audioFileName,
            encoding: '7bit',
            mimetype: 'audio/mpeg',
            buffer: audioBuffer,
            size: audioBuffer.length,
          } as Express.Multer.File;

          // Upload the audio file
          const uploadResult = await this.uploadService.uploadFile(aiResponseFile);
          audioResponseUrl = uploadResult || undefined;

          this.logger.log(`Voice response generated: ${audioResponseUrl}`);
        } catch (error) {
          this.logger.warn('Failed to generate voice response:', error);
          // Continue without voice response
        }
      }

      const aiMessage = await this.messagesService.sendMessage(this.AI_AGENT_USER_ID, {
        content: aiResponse.content,
        conversationId: resolvedConversationId,
        recipientId: userId,
      }, aiResponseFile);

      return {
        success: true,
        aiResponse: aiResponse.content,
        messageId: aiMessage.data.id,
        conversationId: resolvedConversationId,
        audioResponseUrl,
      };
    } catch (error) {
      this.logger.error('Error processing AI message:', error);
      throw new Error('Failed to process AI request. Please try again later.');
    }
  }

  private async getConversationHistory(conversationId: number) {
    try {
      // Get recent messages from the conversation
      const result = await this.messagesService.getMessages(this.AI_AGENT_USER_ID, conversationId);
      
      // Convert to LangChain message format
      return result.messages.map(message => ({
        role: message.sender_id === this.AI_AGENT_USER_ID ? 'assistant' : 'user',
        content: message.content,
      }));
    } catch (error) {
      this.logger.error('Error getting conversation history:', error);
      return [];
    }
  }
}
