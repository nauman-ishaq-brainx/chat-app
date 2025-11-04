import { Body, Controller, HttpException, HttpStatus, Post } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EmailService } from '../ai-agent/services/email.service';
import { CalendarService } from '../ai-agent/services/calendar.service';
import { RagService } from '../rag/rag.service';

@Controller('ai-call')
export class AiCallController {
    constructor(
        private readonly config: ConfigService,
        private readonly emailService: EmailService,
        private readonly calendarService: CalendarService,
        private readonly ragService: RagService,
    ) { }

    @Post('session')
    async createRealtimeSession() {
        const apiKey = this.config.get<string>('OPENAI_API_KEY');
        if (!apiKey) throw new HttpException('OPENAI_API_KEY not configured', HttpStatus.INTERNAL_SERVER_ERROR);

        const res = await fetch('https://api.openai.com/v1/realtime/sessions', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${apiKey}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                model: 'gpt-4o-realtime-preview',
                instructions: `You are a direct assistant who always speaks english, with access to email, calendar, and document tools. 
        
                            BEHAVIOR RULES:
                            Don't say a single word from your own knowledge. You need to call tool for each customer query. NOT A SINGLE WORLD OUTSIDE OF TOOLS.
                            1. EMAIL: For email requests, immediately use SEND_EMAIL tool
                            2. CALENDAR: For calendar requests, immediately use GET_EVENTS or SCHEDULE_EVENT tools
                            3. GENERAL QUESTIONS: For any other questions, immediately use QUERY_DOCUMENTS tool - do NOT ask generic questions or respond without searching documents first
                            DO NOT ask generic questions like "What would you like to know?" or "How can I help?"
                            DO NOT provide general responses without using tools first.
                            FOR EACH QUERY, TREAT IT AS STANDALONE QUERY AND CALL THE TOOL FIRST AND THEN RESPOND. DON'T ASSUME THAT THE QUERY IS RELATED TO ANY OF THE PREVIOUS QUERIES.
                            NEVER SAY A WORD THAT IS NOT FROM THE TOOL RESPONSE. NEVER, EVER.
                            DO NOT SPEAK IF YOU DON'T RECEIVE RESPONSE FROM TOOLS.
                            NONE OF THE QUERIES WILL BE RELATED TO ANY OF THE PREVIOUS QUERIES. TREAT EACH QUERY AS STANDALONE QUERY AND CALL THE TOOL FIRST, WAIT FOR RESPONSE AND THEN RESPOND.

                            FOR EACH QUERY, YOU NEED TO CALL TOOL FIRST AND WAIT FOR ITS RESPONSE. DON'T SPEAK A WORD WITHOUT CALLING AND THE TOOL AND GETTING RESPONSE

                            Do not say a word outside of the tools.
                            Don't use your own knowledge. For knowledge, use the QUERY_DOCUMENTS tool. and read the exact words that you receive in the response.
                            
                            For non-email, non-calendar queries: Immediately search documents using QUERY_DOCUMENTS tool.
                            Always narrate your actions before using tools.
                            After tool execution, summarize the outcome clearly.`,
                tools: [
                    {
                        type: 'function',
                        name: 'SEND_EMAIL',
                        description: 'Send an email to a recipient.',
                        parameters: {
                            type: 'object',
                            properties: {
                                to: { type: 'string', description: 'Email address of the recipient' },
                                subject: { type: 'string', description: 'Subject of the email' },
                                body: { type: 'string', description: 'Email body content' },
                            },
                            required: ['to', 'subject', 'body'],
                        },
                    },
                    {
                        type: 'function',
                        name: 'GET_EVENTS',
                        description: 'Get upcoming calendar events within a date range.',
                        parameters: {
                            type: 'object',
                            properties: {
                                startDate: { type: 'string', description: 'Start date (ISO 8601)' },
                                endDate: { type: 'string', description: 'End date (ISO 8601)' },
                            },
                        },
                    },
              {
                type: 'function',
                name: 'SCHEDULE_EVENT',
                description: 'Add a new calendar event.',
                parameters: {
                  type: 'object',
                  properties: {
                    title: { type: 'string' },
                    description: { type: 'string' },
                    startTime: { type: 'string' },
                    endTime: { type: 'string' },
                    attendees: { type: 'array', items: { type: 'string' } },
                  },
                  required: ['title', 'startTime', 'endTime'],
                },
              },
              {
                type: 'function',
                name: 'QUERY_DOCUMENTS',
                description: 'Search through uploaded documents to answer questions about their content. Use this immediately for any non-email, non-calendar questions.',
                parameters: {
                  type: 'object',
                  properties: {
                    query: { type: 'string', description: 'The question or query to search for in the documents' },
                  },
                  required: ['query'],
                },
              },
                ],
            }),
        });

        if (!res.ok) {
            const text = await res.text();
            throw new HttpException(`OpenAI session error: ${text}`, HttpStatus.BAD_GATEWAY);
        }
        const data = await res.json();
        return { client_secret: data.client_secret?.value, expires_at: data.client_secret?.expires_at };
    }



    // Executes a tool call from the model using your existing services
    @Post('tool-run')
    async toolRun(@Body() body: { name: string; args: any; callId?: string; userId?: number }) {
        const { name, args, userId } = body || {};
        try {
            switch (name) {
                case 'SEND_EMAIL': {
                    const { to, subject, body: text } = args || {};
                    if (!to || !subject || !text) throw new Error('Missing email parameters');
                    const result = await this.emailService.sendEmail({ to, subject, text });
                    return { success: true, result };
                }
                case 'GET_EVENTS': {
                    const { startDate, endDate } = args || {};

                    const toRFC3339 = (value: string | undefined, endOfDay = false): string => {
                        if (!value) return new Date().toISOString();
                        const dateOnly = /^\d{4}-\d{2}-\d{2}$/;
                        if (dateOnly.test(value)) {
                            const iso = endOfDay ? `${value}T23:59:59.999Z` : `${value}T00:00:00.000Z`;
                            return new Date(iso).toISOString();
                        }
                        return new Date(value).toISOString();
                    };

                    const start = toRFC3339(startDate, false);
                    const end = toRFC3339(endDate ?? startDate, true);
                    console.log('🧠 Running GET_EVENTS:', args);
                    console.log('✅ Converted times:', { start, end });
                    const events = await this.calendarService.getEventsInRange(start, end);
                    return { success: true, events };
                }
            case 'SCHEDULE_EVENT': {
              const { title, description, startTime, endTime, attendees } = args || {};
              if (!title || !startTime || !endTime) throw new Error('Missing event parameters');
              const event = await this.calendarService.addEvent({
                summary: title,
                description: description || '',
                startTime,
                endTime,
                attendees: Array.isArray(attendees) ? attendees : [],
              });
              return { success: true, event };
            }
            case 'QUERY_DOCUMENTS': {
              const { query } = args || {};
              if (!query) throw new Error('Missing query parameter');
              if (!userId) throw new Error('User ID is required for document queries');
              const result = await this.ragService.generateRAGResponse(userId, query);
              return { success: true, answer: result.answer, sources: result.sources };
            }
            default:
              return { success: false, error: 'Unknown tool' };
            }
        } catch (e: any) {
            throw new HttpException(e?.message || 'Tool execution failed', HttpStatus.BAD_REQUEST);
        }
    }
}


