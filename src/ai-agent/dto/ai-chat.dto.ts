import { IsString, IsNumber, IsOptional } from 'class-validator';
import { Transform } from 'class-transformer';

export class AiChatDto {
  @IsOptional()
  @IsString()
  message?: string;

  @IsOptional()
  @Transform(({ value }) => value ? Number(value) : undefined)
  @IsNumber()
  conversationId?: number;

  @IsOptional()
  @Transform(({ value }) => value ? Number(value) : undefined)
  @IsNumber()
  recipientId?: number;

  @IsOptional()
  @Transform(({ value }) => value ? Number(value) : undefined)
  @IsNumber()
  userId?: number;
}
