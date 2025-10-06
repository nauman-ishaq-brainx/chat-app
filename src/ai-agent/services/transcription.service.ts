import { Injectable, Logger } from '@nestjs/common';
import OpenAI from 'openai';

@Injectable()
export class TranscriptionService {
  private readonly logger = new Logger(TranscriptionService.name);
  private openai: OpenAI;

  constructor() {
    this.openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });
  }

  async transcribeAudio(audioBuffer: Buffer, filename: string): Promise<string> {
    try {
      this.logger.log(`Transcribing audio file: ${filename}`);
      
      // Create a file object for OpenAI API
      const file = new File([new Uint8Array(audioBuffer)], filename, {
        type: this.getMimeType(filename),
      });

      const transcription = await this.openai.audio.transcriptions.create({
        file: file,
        model: 'whisper-1',
        language: 'en', // You can make this configurable
        response_format: 'text',
      });

      this.logger.log(`Transcription completed: ${transcription.length} characters`);
      return transcription;
    } catch (error) {
      this.logger.error('Failed to transcribe audio:', error);
      throw new Error('Failed to transcribe audio. Please try again.');
    }
  }

  async textToSpeech(text: string, voice: string = 'alloy'): Promise<Buffer> {
    try {
      this.logger.log(`Converting text to speech: ${text.length} characters`);
      
      const response = await this.openai.audio.speech.create({
        model: 'tts-1',
        voice: voice as any,
        input: text,
        response_format: 'mp3',
      });

      const buffer = Buffer.from(await response.arrayBuffer());
      this.logger.log(`Text-to-speech completed: ${buffer.length} bytes`);
      return buffer;
    } catch (error) {
      this.logger.error('Failed to convert text to speech:', error);
      throw new Error('Failed to convert text to speech. Please try again.');
    }
  }

  private getMimeType(filename: string): string {
    const extension = filename.toLowerCase().split('.').pop();
    const mimeTypes: { [key: string]: string } = {
      'mp3': 'audio/mpeg',
      'wav': 'audio/wav',
      'm4a': 'audio/mp4',
      'ogg': 'audio/ogg',
      'flac': 'audio/flac',
    };
    return mimeTypes[extension || 'mp3'] || 'audio/mpeg';
  }
}
