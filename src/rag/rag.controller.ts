import { Body, Controller, Get, Post, UploadedFile, UseGuards, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { RagService } from 'src/rag/rag.service';
import { AuthGuard } from '@nestjs/passport';
import { GetUser } from '../auth/decorator';

@Controller('rag')
@UseGuards(AuthGuard('jwt'))
export class RagController {
  constructor(private readonly ragService: RagService) {}

  @Post('upload')
  @UseInterceptors(FileInterceptor('file'))
  async upload(
    @GetUser('id') userId: number,
    @UploadedFile() file: Express.Multer.File,
  ) {
    return this.ragService.processAndUpsert(userId, file);
  }

  @Post('search')
  async search(
    @GetUser('id') userId: number,
    @Body('query') query: string,
  ) {
    return this.ragService.queryDocuments(userId, query);
  }

  @Post('ask')
  async ask(
    @GetUser('id') userId: number,
    @Body('query') query: string,
  ) {
    return this.ragService.generateRAGResponse(userId, query);
  }
}


