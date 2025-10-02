import { IsString, IsOptional, IsNumber } from 'class-validator';

export class SendMessageDto {
  @IsNumber()
  conversationId: number;

  @IsString()
  content: string;

  @IsOptional()
  @IsString()
  fileUrl?: string;
}

export class UploadFileDto {
  @IsNumber()
  conversationId: number;

  @IsString()
  content: string;
}
