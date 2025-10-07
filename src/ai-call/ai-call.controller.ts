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
                instructions: `You are a transparent assistant. 
        Always narrate your actions. 
        Before using a tool, tell the user what you’re doing.
        After each tool execution, summarize the outcome clearly.`,
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
                description: 'Search through uploaded documents to answer questions about their content.',
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


