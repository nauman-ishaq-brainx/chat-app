import { Injectable, Logger } from '@nestjs/common';
import { ChatOpenAI } from '@langchain/openai';
import { tool } from '@langchain/core/tools';
import { StateGraph, MessagesAnnotation } from '@langchain/langgraph';
import { ToolNode } from '@langchain/langgraph/prebuilt';
import { z } from 'zod';
import { EmailService } from './email.service';
import { CalendarService } from './calendar.service';
import { RagService } from '../../rag/rag.service';

@Injectable()
export class LangchainService {
  private readonly logger = new Logger(LangchainService.name);
  private agentGraph: any;
  private llm: ChatOpenAI;

  constructor(
    private readonly emailService: EmailService,
    private readonly calendarService: CalendarService,
    private readonly ragService: RagService,
  ) {
    this.initializeAgent();
  }

  private initializeAgent() {
    const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Karachi' });

    // Email Tool
    const emailTool = tool(
      async ({ to, subject, text }) => {
        try {
          const result = await this.emailService.sendEmail({ to, subject, text });
          if (result.messageId === 'disabled') {
            return 'Email service is not configured. Please set up SMTP credentials to enable email functionality.';
          }
          return 'Email sent.';
        } catch (err) {
          return 'It seems there is an issue with sending the email. Please try again later or check the email address for any errors.';
        }
      },
      {
        name: 'sendEmail',
        description: 'Send an email with a subject and body to a given email address.',
        schema: z.object({
          to: z.string().email().describe('Recipient email'),
          subject: z.string().describe('Subject of the email'),
          text: z.string().describe('Body of the email'),
        }),
      },
    );

    // Calendar Event Tool
    const calendarEventTool = tool(
      async ({ summary, description, startTime, endTime, attendees }) => {
        try {
          const event = await this.calendarService.addEvent({
            summary,
            description,
            startTime,
            endTime,
            attendees,
          });
          return `Event created: ${event.htmlLink}`;
        } catch (err) {
          return 'Failed to create the calendar event. Please check the details or try again later.';
        }
      },
      {
        name: 'addCalendarEvent',
        description: 'Schedule a new event in Google Calendar. Provide the title, description, start, and end time.',
        schema: z.object({
          summary: z.string().describe('Title of the calendar event'),
          description: z.string().describe('Details of the event'),
          startTime: z.string().describe('Start time in ISO format with timezone, e.g. 2025-07-03T14:00:00+05:00'),
          endTime: z.string().describe('End time in ISO format with timezone, e.g. 2025-07-03T15:00:00+05:00'),
          attendees: z
            .array(
              z.object({
                email: z.string().email().describe('Email of the attendee'),
                displayName: z.string().optional().describe('Name of the attendee'),
              }),
            )
            .optional()
            .describe('List of attendees to invite to the event'),
        }),
      },
    );

    // Get Events Tool
    const getEventsInRangeTool = tool(
      async ({ startTime, endTime }) => {
        try {
          const events = await this.calendarService.getEventsInRange(startTime, endTime);
          if (!events.length) return 'No events found in this time range.';

          const formatted = events.map((event) => {
            const start = event.start?.dateTime || event.start?.date;
            const end = event.end?.dateTime || event.end?.date;
            return `📅 ${event.summary} (${start} → ${end})`;
          });

          return `Found ${events.length} event(s):\n\n${formatted.join('\n')}`;
        } catch (err) {
          return 'Failed to fetch calendar events. Please check the time range format.';
        }
      },
      {
        name: 'getEventsInRange',
        description: 'Get all calendar events between a given start and end time. Use ISO format with timezone offset.',
        schema: z.object({
          startTime: z
            .string()
            .describe('Start of the time range in ISO 8601 format with timezone, e.g. 2025-07-03T00:00:00+05:00'),
          endTime: z
            .string()
            .describe('End of the time range in ISO 8601 format with timezone, e.g. 2025-07-03T23:59:59+05:00'),
        }),
      },
    );

    // RAG Query Tool
    const ragQueryTool = tool(
      async ({ query }, { configurable }) => {
        try {
          const userId = configurable?.userId || 1; // Fallback to user 1 if not provided
          const result = await this.ragService.generateRAGResponse(userId, query);
          if (result.success && result.answer) {
            return result.answer;
          } else {
            return "I couldn't find any relevant information in your documents to answer this question.";
          }
        } catch (err) {
          this.logger.error('RAG query error:', err);
          return "I couldn't find any relevant information in your documents to answer this question.";
        }
      },
      {
        name: 'queryDocuments',
        description: 'Search through uploaded documents to answer questions about their content. Use this for general knowledge questions that might be in the user\'s documents.',
        schema: z.object({
          query: z.string().describe('The question or query to search for in the documents'),
        }),
      },
    );

    // Setup tools and LLM
    const tools = [emailTool, calendarEventTool, getEventsInRangeTool, ragQueryTool];
    const toolNode = new ToolNode(tools);

    this.llm = new ChatOpenAI({
      modelName: process.env.CHAT_MODEL || 'gpt-4o',
      temperature: 0,
    });

    // LLM Call Node
    const llmCall = async (state) => {
      const systemPrompt = {
        role: 'system',
        content: `
You are a helpful AI assistant with access to several tools. Use the appropriate tool based on the user's request:

1. EMAIL TOOL: Use 'sendEmail' when the user wants to send an email. The sender name should be 'Nauman' and don't use any placeholders in the email.

2. CALENDAR TOOLS: 
   - Use 'addCalendarEvent' when the user wants to schedule a new event
   - Use 'getEventsInRange' when the user asks for their schedule, events, or availability
   
   For calendar events:
   - Always use today's date unless the user specifies another day (Today is ${today})
   - Always set event time in the 'Asia/Karachi' timezone (UTC+05:00)
   - Always return ISO 8601 datetime strings with timezone offsets
   - Example: "2025-07-03T14:00:00+05:00" (for 2:00 PM Pakistan time)
   - Do NOT use UTC time or 'Z' suffix
   - For attendees, use format: [{"email": "lead@example.com", "displayName": "Team Lead"}]
   - If no attendees, keep the array empty
   - Add only one event in a single query

3. DOCUMENT SEARCH: Use 'queryDocuments' for general questions that might be answered by the user's uploaded documents. This includes:
   - Questions about specific topics that might be in their documents
   - Requests for information that could be found in uploaded files
   - General knowledge questions where document content might be relevant

4. TOOL SELECTION PRIORITY:
   - If the user asks about sending emails → use sendEmail
   - If the user asks about calendar/schedule → use calendar tools
   - If the user asks general questions → use queryDocuments
   - If queryDocuments returns "couldn't find information" → tell the user you couldn't find that information in their documents

Always use the appropriate tool and don't respond with free text unless no tool is applicable.
`.trim(),
      };

      const result = await this.llm.bindTools(tools).invoke([systemPrompt, ...state.messages]);
      return { messages: [result] };
    };

    // Routing logic
    const shouldContinue = (state) => {
      const last = state.messages.at(-1);
      return last?.tool_calls?.length ? 'tools' : '__end__';
    };

    // Create the agent graph
    this.agentGraph = new StateGraph(MessagesAnnotation)
      .addNode('llmCall', llmCall)
      .addNode('tools', toolNode)
      .addEdge('__start__', 'llmCall')
      .addConditionalEdges('llmCall', shouldContinue, {
        tools: 'tools',
        __end__: '__end__',
      })
      .addEdge('tools', 'llmCall')
      .compile();
  }

      async runAgent(userMessageHistory: any[], userId: number) {
        try {
          // Create a modified state that includes userId for RAG queries
          const result = await this.agentGraph.invoke(
            { 
              messages: userMessageHistory,
              userId: userId // Pass userId for RAG queries
            },
            { recursionLimit: 10 } // Reduce recursion limit to prevent infinite loops
          );
          return result.messages.at(-1);
        } catch (error) {
          this.logger.error('Error running AI agent:', error);
          
          // If it's a recursion limit error, return a simple response
          if (error.message?.includes('recursion limit') || error.message?.includes('GRAPH_RECURSION_LIMIT')) {
            this.logger.warn('AI agent hit recursion limit, returning fallback response');
            return {
              content: 'I apologize, but I encountered an issue processing your request. Please try rephrasing your message or ask for something simpler.',
              role: 'assistant'
            };
          }
          
          // Return a fallback response instead of throwing
          return {
            content: 'I apologize, but I encountered an issue processing your request. Please try again later.',
            role: 'assistant'
          };
        }
      }
}
