import { BadRequestException, ForbiddenException, Inject, Injectable } from '@nestjs/common';
import { Pool } from 'pg';

@Injectable()
export class ConversationsService {
    constructor(@Inject('PG_CONNECTION') private pool: Pool) { }
    async createConversation(
        userId: number,
        body: { name?: string; memberIds: number[] },
    ) {
        const { name, memberIds } = body;

        if (!memberIds || memberIds.length === 0) {
            throw new BadRequestException('At least one member is required');
        }

        // Include the requesting user as a member
        const allMemberIds = Array.from(new Set([...memberIds, userId]));

        // 1️⃣ Validate that all member IDs exist
        const { rows: existingUsers } = await this.pool.query(
            'SELECT id FROM users WHERE id = ANY($1)',
            [allMemberIds],
        );

        if (existingUsers.length !== allMemberIds.length) {
            const existingIds = existingUsers.map((u) => u.id);
            const invalidIds = allMemberIds.filter((id) => !existingIds.includes(id));
            throw new BadRequestException(`Invalid user IDs: ${invalidIds.join(', ')}`);
        }

        // 2️⃣ Create the conversation (always a group)
        const { rows: conversationRows } = await this.pool.query(
            'INSERT INTO conversations (is_group, name, created_at) VALUES ($1, $2, now()) RETURNING *',
            [true, name || null],
        );
        const conversation = conversationRows[0];

        // 3️⃣ Add members to conversation_members
        const values = allMemberIds.map((id) => `(${conversation.id}, ${id}, now())`).join(',');
        await this.pool.query(
            `INSERT INTO conversation_members (conversation_id, user_id, joined_at) VALUES ${values}`,
        );

        return {
            message: 'Conversation created',
            conversation,
            memberIds: allMemberIds,
        };
    }

    async getUserConversations(userId: number, type?: 'dm' | 'group') {
        if (type === 'dm' || !type) {
            // Fetch private conversations with the other user's name
            const query = `
            SELECT c.id, c.is_group,
              u.id AS other_user_id,
              u.name AS other_user_name,
              u.email AS other_user_email,
              c.created_at
            FROM conversations c
            JOIN conversation_members cm ON c.id = cm.conversation_id
            JOIN conversation_members other_cm ON c.id = other_cm.conversation_id AND other_cm.user_id != $1
            JOIN users u ON other_cm.user_id = u.id
            WHERE cm.user_id = $1 AND c.is_group = false
            ORDER BY c.created_at DESC;
          `;
            const result = await this.pool.query(query, [userId]);
            return result.rows;
        } else {
            // Fetch groups
            const query = `
            SELECT c.*
            FROM conversations c
            JOIN conversation_members cm ON c.id = cm.conversation_id
            WHERE cm.user_id = $1 AND c.is_group = true
            ORDER BY c.created_at DESC;
          `;
            const result = await this.pool.query(query, [userId]);
            return result.rows;
        }
    }

    async getConversationMembers(conversationId: number, userId: number) {
        // 1️⃣ Check if the requesting user is a member
        const { rows: membershipCheck } = await this.pool.query(
          'SELECT 1 FROM conversation_members WHERE conversation_id = $1 AND user_id = $2',
          [conversationId, userId],
        );
      
        if (membershipCheck.length === 0) {
          throw new ForbiddenException('You are not a member of this conversation');
        }
      
        // 2️⃣ Get all members of the conversation
        const query = `
          SELECT u.id, u.name, u.email
          FROM conversation_members cm
          JOIN users u ON cm.user_id = u.id
          WHERE cm.conversation_id = $1
        `;
        const result = await this.pool.query(query, [conversationId]);
      
        return {
          conversationId,
          members: result.rows, // array of user objects
        };
      }
      


    async addMember(requestingUserId: number, conversationId: number, userIdToAdd: number) {
        // 0️⃣ Check if requesting user is in the conversation
        const { rows: requesterRows } = await this.pool.query(
            'SELECT id FROM conversation_members WHERE conversation_id = $1 AND user_id = $2',
            [conversationId, requestingUserId],
        );

        if (requesterRows.length === 0) {
            throw new ForbiddenException('You are not a member of this conversation');
        }

        // 1️⃣ Check if the user to add exists
        const { rows: existingUsers } = await this.pool.query(
            'SELECT id FROM users WHERE id = $1',
            [userIdToAdd],
        );

        if (existingUsers.length === 0) {
            throw new BadRequestException('User to add does not exist');
        }

        // 2️⃣ Check if the user is already a member
        const { rows: existingMember } = await this.pool.query(
            'SELECT id FROM conversation_members WHERE conversation_id = $1 AND user_id = $2',
            [conversationId, userIdToAdd],
        );

        if (existingMember.length > 0) {
            throw new BadRequestException('User is already a member of this conversation');
        }

        // 3️⃣ Add the new member
        await this.pool.query(
            'INSERT INTO conversation_members (conversation_id, user_id, joined_at) VALUES ($1, $2, now())',
            [conversationId, userIdToAdd],
        );

        return { message: 'Member added', conversationId, userIdToAdd };
    }

}
