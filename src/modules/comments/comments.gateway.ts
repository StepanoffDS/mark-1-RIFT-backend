import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { isUUID } from 'class-validator';
import type { Server, Socket } from 'socket.io';

import { getAuthCookieName } from '../auth/lib/auth-cookie';
import { AccessTokenPayload, AuthCookie } from '../auth/types';
import type { Comment } from './types';

type IncidentRoomRequest = { incidentId: string };

@WebSocketGateway({
  path: '/ws',
  cors: { origin: true, credentials: true },
})
export class CommentsGateway implements OnGatewayConnection {
  private readonly authenticated = new WeakSet<Socket>();

  @WebSocketServer()
  private server!: Server;

  constructor(
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) {}

  async handleConnection(client: Socket) {
    try {
      const origin = client.handshake.headers.origin;
      if (origin !== this.configService.getOrThrow<string>('CORS_ORIGIN')) {
        throw new Error('Invalid origin');
      }
      const token = this.readCookie(client, AuthCookie.Access);
      if (!token) throw new Error('Access token is missing');
      await this.jwtService.verifyAsync<AccessTokenPayload>(token, {
        issuer: this.configService.getOrThrow<string>('JWT_ISSUER'),
        audience: this.configService.getOrThrow<string>('JWT_AUDIENCE'),
        algorithms: ['HS256'],
      });
      this.authenticated.add(client);
    } catch {
      client.disconnect(true);
    }
  }

  @SubscribeMessage('incident:join')
  async joinIncident(
    @ConnectedSocket() client: Socket,
    @MessageBody() body: IncidentRoomRequest,
  ) {
    if (!this.authenticated.has(client)) return { error: 'Unauthorized' };
    if (!isUUID(body?.incidentId, '4')) return { error: 'Invalid incident ID' };

    await client.join(this.room(body.incidentId));
    return { incidentId: body.incidentId };
  }

  @SubscribeMessage('incident:leave')
  leaveIncident(
    @ConnectedSocket() client: Socket,
    @MessageBody() body: IncidentRoomRequest,
  ) {
    if (!this.authenticated.has(client)) return { error: 'Unauthorized' };
    if (isUUID(body?.incidentId, '4')) {
      void client.leave(this.room(body.incidentId));
    }
    return { incidentId: body?.incidentId };
  }

  emitCreated(incidentId: string, comment: Comment) {
    this.server.to(this.room(incidentId)).emit('comment:created', { comment });
  }

  emitUpdated(incidentId: string, comment: Comment) {
    this.server.to(this.room(incidentId)).emit('comment:updated', { comment });
  }

  emitDeleted(incidentId: string, commentId: string) {
    this.server
      .to(this.room(incidentId))
      .emit('comment:deleted', { commentId, incidentId });
  }

  private room(incidentId: string) {
    return `incident:${incidentId}`;
  }

  private readCookie(client: Socket, cookie: AuthCookie) {
    const name = getAuthCookieName(this.configService, cookie);
    const header = client.handshake.headers.cookie;
    const pair = header
      ?.split(';')
      .map((value) => value.trim())
      .find((value) => value.startsWith(`${name}=`));
    return pair ? decodeURIComponent(pair.slice(name.length + 1)) : null;
  }
}
