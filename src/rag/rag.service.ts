import { BadRequestException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PDFDocument } from 'pdf-lib';
import * as mammoth from 'mammoth';
import OpenAI from 'openai';
import { Pinecone } from '@pinecone-database/pinecone';

@Injectable()
export class RagService {
  private openai: OpenAI;
  private pinecone: Pinecone;

  constructor(private config: ConfigService) {
    this.openai = new OpenAI({ apiKey: this.config.get<string>('OPENAI_API_KEY') });
    this.pinecone = new Pinecone({ apiKey: this.config.get<string>('PINECONE_API_KEY')! });
  }

  async processAndUpsert(userId: number, file: Express.Multer.File, namespace?: string) {
    if (!file) throw new BadRequestException('No file provided');

    const ext = (file.originalname.split('.').pop() || '').toLowerCase();
    if (!['pdf', 'docx'].includes(ext)) throw new BadRequestException('Only PDF and DOCX are supported');

    const text = await this.extractText(file, ext as 'pdf'|'docx');
    const chunks = this.chunkText(text, 1200, 200);

    const model = this.config.get<string>('EMBEDDING_MODEL') || 'text-embedding-3-large';
    const indexName = this.config.get<string>('PINECONE_INDEX')!;
    if (!indexName) throw new BadRequestException('PINECONE_INDEX not configured');

    const index = this.pinecone.index(indexName);

    // Create embeddings in batches
    const vectors: Array<{ id: string; values: number[]; metadata: any }> = [];
    for (let i = 0; i < chunks.length; i++) {
      const input = chunks[i];
      const res = await this.openai.embeddings.create({ model, input });
      const values = res.data[0].embedding as unknown as number[];
      vectors.push({
        id: `${userId}-${Date.now()}-${i}`,
        values,
        metadata: {
          userId,
          fileName: file.originalname,
          chunkIndex: i,
          text: input,
        },
      });
    }

    // Upsert to Pinecone
    await index.namespace(namespace || `user-${userId}`).upsert(vectors);

    return {
      success: true,
      chunks: chunks.length,
      index: indexName,
      namespace: namespace || `user-${userId}`,
    };
  }

  private async extractText(file: Express.Multer.File, type: 'pdf'|'docx'): Promise<string> {
    if (type === 'pdf') {
      try {
        // For now, return a placeholder since pdf-lib doesn't extract text directly
        // In production, you'd want to use a proper text extraction library
        throw new BadRequestException('PDF text extraction not yet implemented. Please use DOCX files for now.');
      } catch (error) {
        console.error('PDF parsing error:', error);
        throw new BadRequestException('Failed to parse PDF file. Please ensure the file is not corrupted.');
      }
    }
    // docx
    try {
      const res = await mammoth.extractRawText({ buffer: file.buffer });
      return (res.value || '').trim();
    } catch (error) {
      console.error('DOCX parsing error:', error);
      throw new BadRequestException('Failed to parse DOCX file. Please ensure the file is not corrupted.');
    }
  }

  private chunkText(text: string, maxTokensApprox = 1200, overlapApprox = 200): string[] {
    const clean = text.replace(/\s+/g, ' ').trim();
    if (!clean) return [];
    const size = maxTokensApprox; // approx by chars; good enough for ingestion
    const overlap = overlapApprox;
    const out: string[] = [];
    let i = 0;
    while (i < clean.length) {
      const end = Math.min(i + size, clean.length);
      out.push(clean.slice(i, end));
      if (end === clean.length) break;
      i = Math.max(0, end - overlap);
    }
    return out;
  }

  async queryDocuments(
    userId: number,
    query: string,
    topK: number = 5,
    namespace?: string,
  ) {
    if (!query || query.trim().length === 0) {
      throw new BadRequestException('Query cannot be empty');
    }

    const model = this.config.get<string>('EMBEDDING_MODEL') || 'text-embedding-3-large';
    const indexName = this.config.get<string>('PINECONE_INDEX')!;
    if (!indexName) throw new BadRequestException('PINECONE_INDEX not configured');

    const index = this.pinecone.index(indexName);

    try {
      // Generate embedding for the query
      const queryEmbedding = await this.openai.embeddings.create({
        model,
        input: query,
      });

      const queryVector = queryEmbedding.data[0].embedding as unknown as number[];

      // Query Pinecone
      const queryResponse = await index.namespace(namespace || `user-${userId}`).query({
        vector: queryVector,
        topK,
        includeMetadata: true,
      });

      // Format results
      const results = queryResponse.matches?.map((match) => ({
        id: match.id,
        score: match.score,
        text: match.metadata?.text || '',
        fileName: match.metadata?.fileName || '',
        chunkIndex: match.metadata?.chunkIndex || 0,
        userId: match.metadata?.userId || userId,
      })) || [];

      return {
        success: true,
        query,
        results,
        totalResults: results.length,
        namespace: namespace || `user-${userId}`,
      };
    } catch (error) {
      console.error('Query error:', error);
      throw new BadRequestException('Failed to query documents. Please try again.');
    }
  }

  async generateRAGResponse(
    userId: number,
    query: string,
    topK: number = 5,
    namespace?: string,
  ) {
    if (!query || query.trim().length === 0) {
      throw new BadRequestException('Query cannot be empty');
    }

    const model = this.config.get<string>('EMBEDDING_MODEL') || 'text-embedding-3-large';
    const indexName = this.config.get<string>('PINECONE_INDEX')!;
    if (!indexName) throw new BadRequestException('PINECONE_INDEX not configured');

    const index = this.pinecone.index(indexName);

    try {
      // Step 1: Generate embedding for the query
      const queryEmbedding = await this.openai.embeddings.create({
        model,
        input: query,
      });

      const queryVector = queryEmbedding.data[0].embedding as unknown as number[];

      // Step 2: Retrieve relevant documents from Pinecone
      const queryResponse = await index.namespace(namespace || `user-${userId}`).query({
        vector: queryVector,
        topK,
        includeMetadata: true,
      });

      // Step 3: Format retrieved documents
      const retrievedDocs = queryResponse.matches?.map((match) => ({
        text: match.metadata?.text || '',
        fileName: match.metadata?.fileName || '',
        score: match.score,
      })) || [];

      if (retrievedDocs.length === 0) {
        return {
          success: true,
          query,
          answer: "I couldn't find any relevant information in your documents to answer this question.",
          sources: [],
          totalSources: 0,
        };
      }

      // Step 4: Create context from retrieved documents
      const context = retrievedDocs
        .map((doc, index) => `[Source ${index + 1} from ${doc.fileName}]: ${doc.text}`)
        .join('\n\n');

      // Step 5: Generate AI response using retrieved context
      const chatModel = this.config.get<string>('CHAT_MODEL') || 'gpt-4o';
      const completion = await this.openai.chat.completions.create({
        model: chatModel,
        messages: [
          {
            role: 'system',
            content: `You are a helpful assistant that answers questions based on the provided documents. Use only the information from the documents to answer the user's question. If the documents don't contain enough information to answer the question, say so clearly. Always cite which source(s) you used for your answer.`,
          },
          {
            role: 'user',
            content: `Based on the following documents, please answer this question: "${query}"\n\nDocuments:\n${context}`,
          },
        ],
        temperature: 0.7,
        max_tokens: 1000,
      });

      const answer = completion.choices[0]?.message?.content || 'Sorry, I could not generate a response.';

      // Step 6: Format sources for response
      const sources = retrievedDocs.map((doc, index) => ({
        source: index + 1,
        fileName: doc.fileName,
        score: doc.score,
        text: String(doc.text).substring(0, 200) + '...', // Preview of the text
      }));

      return {
        success: true,
        query,
        answer,
        sources,
        totalSources: sources.length,
        namespace: namespace || `user-${userId}`,
      };
    } catch (error) {
      console.error('RAG generation error:', error);
      throw new BadRequestException('Failed to generate response. Please try again.');
    }
  }
}