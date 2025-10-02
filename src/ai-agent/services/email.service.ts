import { Injectable, Logger } from '@nestjs/common';
import * as nodemailer from 'nodemailer';

@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);
  private transporter: nodemailer.Transporter;

  constructor() {
    // Use the correct environment variable names from your .env file
    const emailUser = process.env.EMAIL_USER || process.env.SMTP_USER;
    const emailPass = process.env.EMAIL_PASS || process.env.SMTP_PASS;
    const emailHost = process.env.EMAIL_HOST || process.env.SMTP_HOST || 'smtp.gmail.com';
    const emailPort = process.env.EMAIL_PORT || process.env.SMTP_PORT || '587';
    
    // Debug: Log what environment variables are available
    this.logger.log(`EMAIL_USER: ${emailUser ? 'SET' : 'NOT SET'}`);
    this.logger.log(`EMAIL_PASS: ${emailPass ? 'SET' : 'NOT SET'}`);
    this.logger.log(`EMAIL_HOST: ${emailHost}`);
    
    // Only create transporter if credentials are provided
    if (emailUser && emailPass) {
      this.transporter = nodemailer.createTransport({
        host: emailHost,
        port: parseInt(emailPort),
        secure: false,
        auth: {
          user: emailUser,
          pass: emailPass,
        },
      });
      this.logger.log('Email service configured successfully');
    } else {
      this.logger.warn('Email credentials not provided. Email functionality will be disabled.');
    }
  }

  async sendEmail({ to, subject, text }: { to: string; subject: string; text: string }) {
    try {
      if (!this.transporter) {
        this.logger.warn('Email service not configured. Email not sent.');
        return { messageId: 'disabled', response: 'Email service not configured' };
      }

      const mailOptions = {
        from: process.env.SMTP_FROM || 'Nauman <nauman@example.com>',
        to,
        subject,
        text,
      };

      const result = await this.transporter.sendMail(mailOptions);
      this.logger.log(`Email sent successfully to ${to}`);
      return result;
    } catch (error) {
      this.logger.error(`Failed to send email to ${to}:`, error);
      throw new Error('Failed to send email. Please try again later.');
    }
  }
}
