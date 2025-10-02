import { Injectable, Logger } from '@nestjs/common';
import { google } from 'googleapis';

@Injectable()
export class CalendarService {
  private readonly logger = new Logger(CalendarService.name);
  private calendar: any;

  constructor() {
    const auth = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET,
      'urn:ietf:wg:oauth:2.0:oob' // For installed applications
    );

    auth.setCredentials({
      refresh_token: process.env.GOOGLE_REFRESH_TOKEN,
    });

    this.calendar = google.calendar({ version: 'v3', auth });
  }

  async addEvent({
    summary,
    description,
    startTime,
    endTime,
    attendees = [],
  }: {
    summary: string;
    description: string;
    startTime: string;
    endTime: string;
    attendees?: Array<{ email: string; displayName?: string }>;
  }) {
    try {
      const event = {
        summary,
        description,
        start: {
          dateTime: startTime,
          timeZone: 'Asia/Karachi',
        },
        end: {
          dateTime: endTime,
          timeZone: 'Asia/Karachi',
        },
        attendees: attendees.map(attendee => ({
          email: attendee.email,
          displayName: attendee.displayName,
        })),
      };

      const response = await this.calendar.events.insert({
        calendarId: 'primary',
        resource: event,
      });

      this.logger.log(`Calendar event created: ${response.data.htmlLink}`);
      return response.data;
    } catch (error) {
      this.logger.error('Failed to create calendar event:', error);
      throw new Error('Failed to create calendar event. Please check the details or try again later.');
    }
  }

  async getEventsInRange(startTime: string, endTime: string) {
    try {
      const response = await this.calendar.events.list({
        calendarId: 'primary',
        timeMin: startTime,
        timeMax: endTime,
        singleEvents: true,
        orderBy: 'startTime',
      });

      return response.data.items || [];
    } catch (error) {
      this.logger.error('Failed to fetch calendar events:', error);
      
      // If it's an authentication error, return empty array instead of throwing
      if (error.message?.includes('client_email') || error.message?.includes('credentials')) {
        this.logger.warn('Calendar authentication failed, returning empty events list');
        return [];
      }
      
      throw new Error('Failed to fetch calendar events. Please check the time range format.');
    }
  }
}
