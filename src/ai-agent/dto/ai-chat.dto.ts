import { IsString, IsNumber, IsOptional, ValidateIf } from 'class-validator';

export class AiChatDto {
  @IsString()
  message: string;

  @IsOptional()
  @IsNumber()
  conversationId?: number;

  @ValidateIf((o) => !o.conversationId)
  @IsNumber()
  recipientId?: number;

  @IsOptional()
  @IsNumber()
  userId?: number;
}
