import { BadRequestException, ForbiddenException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { Pool } from 'pg';
import { MessagesGateway } from './messages.gateway';
import { UploadService } from './upload.service';

@Injectable()
export class MessagesService {
  constructor(
    @Inject('PG_CONNECTION') private pool: Pool,
    private messagesGateway: MessagesGateway,
    private uploadService: UploadService,
  ) {}

  async sendMessage(
    senderId: number,
    body: { conversationId?: number; recipientId?: number; content: string },
    file?: Express.Multer.File,
  ) {
    const { conversationId, recipientId, content } = body;

    if ((!content || content.trim().length === 0) && !file) {
      throw new BadRequestException('Either message content or a file is required');
    }

    let resolvedConversationId = conversationId;

    // Case 1: Group or DM via conversationId
    if (conversationId) {
      // Check sender is a member
      const { rows: members } = await this.pool.query(
        `SELECT user_id FROM conversation_members WHERE conversation_id = $1`,
        [conversationId],
      );

      const memberIds = members.map((m) => m.user_id);
      if (!memberIds.includes(senderId)) {
        throw new ForbiddenException('You are not a member of this conversation');
      }

      // If recipientId is also passed, validate consistency for DM
      if (recipientId) {
        const { rows: convRows } = await this.pool.query(
          `SELECT is_group FROM conversations WHERE id = $1`,
          [conversationId],
        );

        if (convRows.length === 0) throw new BadRequestException('Conversation does not exist');
        if (convRows[0].is_group) {
          throw new BadRequestException('recipientId should not be provided for group chats');
        }

        if (!memberIds.includes(recipientId)) {
          throw new BadRequestException(
            'recipientId does not belong to this conversation',
          );
        }
      }
    }

    // Case 2: DM via recipientId only (lazy create)
    if (!conversationId && recipientId) {
      // Check recipient exists
      const { rows: userCheck } = await this.pool.query(
        `SELECT id FROM users WHERE id = $1`,
        [recipientId],
      );
      if (userCheck.length === 0) {
        throw new BadRequestException('Recipient does not exist');
      }

      // Find existing DM conversation
      const { rows: dmRows } = await this.pool.query(
        `
        SELECT c.id
        FROM conversations c
        JOIN conversation_members cm1 ON c.id = cm1.conversation_id
        JOIN conversation_members cm2 ON c.id = cm2.conversation_id
        WHERE c.is_group = false AND cm1.user_id = $1 AND cm2.user_id = $2
        `,
        [senderId, recipientId],
      );

      if (dmRows.length > 0) {
        resolvedConversationId = dmRows[0].id;
      } else {
        // Create new DM conversation
        const { rows: convRows } = await this.pool.query(
          `INSERT INTO conversations (is_group, created_at) VALUES (false, now()) RETURNING id`,
        );
        resolvedConversationId = convRows[0].id;

        // Add both members
        await this.pool.query(
          `INSERT INTO conversation_members (conversation_id, user_id, joined_at)
           VALUES ($1, $2, now()), ($1, $3, now())`,
          [resolvedConversationId, senderId, recipientId],
        );
      }
    }

    if (!resolvedConversationId) {
      throw new BadRequestException('Either conversationId or recipientId must be provided');
    }

    // Handle file upload if present
    let fileUrl : null | string = null;
    if (file) {
      fileUrl = await this.uploadService.uploadFile(file);
    }

    // Save message with optional file URL
    const { rows: messageRows } = await this.pool.query(
      `INSERT INTO messages (conversation_id, sender_id, content, file_url, created_at)
       VALUES ($1, $2, $3, $4, now())
       RETURNING *`,
      [resolvedConversationId, senderId, content, fileUrl],
    );

    const savedMessage = messageRows[0];

    return {
      message: 'Message sent',
      conversationId: resolvedConversationId,
      data: savedMessage,
    };
  }
  async getMessages(userId: number, conversationId: number) {
    // 1️⃣ Check if the conversation exists
    const conversationRes = await this.pool.query(
      `SELECT * FROM conversations WHERE id = $1`,
      [conversationId],
    );

    if (conversationRes.rowCount === 0) {
      throw new NotFoundException('Conversation not found');
    }

    // 2️⃣ Check if user is a member of this conversation
    const memberRes = await this.pool.query(
      `SELECT * FROM conversation_members WHERE conversation_id = $1 AND user_id = $2`,
      [conversationId, userId],
    );

    if (memberRes.rowCount === 0) {
      throw new ForbiddenException('You are not a member of this conversation');
    }

    // 3️⃣ Fetch messages
    const messagesRes = await this.pool.query(
      `
      SELECT m.id, m.content, m.created_at, 
             u.id as sender_id, u.name as sender_name, u.email as sender_email, file_url
      FROM messages m
      JOIN users u ON m.sender_id = u.id
      WHERE m.conversation_id = $1
      ORDER BY m.created_at ASC
      `,
      [conversationId],
    );

    return {
      conversationId,
      messages: messagesRes.rows,
    };
  }
  async deleteMessage(messageId: number, userId: number) {
    // 1️⃣ Find the message
    const { rows } = await this.pool.query(
      'SELECT * FROM messages WHERE id = $1',
      [messageId],
    );
    const message = rows[0];

    if (!message) {
      throw new NotFoundException('Message not found');
    }

    // 2️⃣ Ensure only the sender can delete
    if (message.sender_id !== userId) {
      throw new ForbiddenException('You can only delete your own messages');
    }

    // 3️⃣ Delete from DB
    await this.pool.query('DELETE FROM messages WHERE id = $1', [messageId]);

    return { message: 'Message deleted successfully', messageId };
  }
  
}
