// src/conversations/dto/create-conversation.dto.ts
import { IsString, IsArray, ArrayNotEmpty, ArrayUnique } from 'class-validator';

export class CreateConversationDto {
  @IsString()
  name?: string;

  @IsArray()
  @ArrayNotEmpty()
  @ArrayUnique()
  memberIds: number[];
}
