import {
    WebSocketGateway,
    WebSocketServer,
    SubscribeMessage,
    MessageBody,
    ConnectedSocket,
  } from '@nestjs/websockets';
  import { Server, Socket } from 'socket.io';
  
  @WebSocketGateway({
    cors: {
      origin: true,
      credentials: true,
    },
  })
  export class MessagesGateway {
    @WebSocketServer()
    server: Server;
  
    // ✅ Join a conversation room
    @SubscribeMessage('joinRoom')
    handleJoinRoom(
      @MessageBody() data: { conversationId: number; userId: number },
      @ConnectedSocket() client: Socket,
    ) {
      const roomName = `conversation_${data.conversationId}`;
      client.join(roomName);
      return { success: true, room: roomName };
    }
  
    // ✅ Leave a conversation room
    @SubscribeMessage('leaveRoom')
    handleLeaveRoom(
      @MessageBody() data: { conversationId: number; userId: number },
      @ConnectedSocket() client: Socket,
    ) {
      const roomName = `conversation_${data.conversationId}`;
      client.leave(roomName);
      return { success: true, room: roomName };
    }
  
    // ✅ Handle sending messages
    @SubscribeMessage('sendMessage')
    async handleSendMessage(
      @MessageBody() data: { conversationId: number; userId: number; text: string },
    ) {

      const roomName = `conversation_${data.conversationId}`;
  
      // Just broadcast to the room (no DB save)
      this.server.to(roomName).emit('newMessage', {
        conversationId: data.conversationId,
        userId: data.userId,
        text: data.text,
        createdAt: new Date().toISOString(), // fake timestamp
      });
  
      return { success: true };
    }
  }
  