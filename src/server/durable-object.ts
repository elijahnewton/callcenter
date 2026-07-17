import { DurableObject } from 'cloudflare:workers';

export interface Env {
  DB: any; // D1Database
}

type MessageType = 
  | { type: 'LOCK_CONTACT', contactId: string, userId: string }
  | { type: 'UNLOCK_CONTACT', contactId: string, userId: string }
  | { type: 'COMPLETE_CONTACT', contactId: string, userId: string };

export class GroupCoordinator extends DurableObject {
  private sessions: Set<WebSocket>;
  private env: Env;

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    this.env = env;
    this.sessions = new Set();
  }

  async fetch(request: Request): Promise<Response> {
    const upgradeHeader = request.headers.get('Upgrade');
    if (!upgradeHeader || upgradeHeader !== 'websocket') {
      return new Response('Expected Upgrade: websocket', { status: 426 });
    }

    const [client, server] = Object.values(new WebSocketPair());
    
    this.ctx.acceptWebSocket(server);
    this.sessions.add(server);

    return new Response(null, {
      status: 101,
      webSocket: client,
    });
  }

  async webSocketMessage(ws: WebSocket, message: string | ArrayBuffer) {
    try {
      const data = JSON.parse(message as string) as MessageType;
      
      switch (data.type) {
        case 'LOCK_CONTACT':
          // Broadcast first for zero-latency UI update
          this.broadcast(JSON.stringify({ type: 'CONTACT_LOCKED', contactId: data.contactId, userId: data.userId }), ws);
          // Async update D1
          await this.env.DB.prepare('UPDATE contacts SET status = ?, locked_by = ? WHERE id = ?')
            .bind('locked', data.userId, data.contactId).run();
          break;
        case 'UNLOCK_CONTACT':
          this.broadcast(JSON.stringify({ type: 'CONTACT_UNLOCKED', contactId: data.contactId }), ws);
          await this.env.DB.prepare('UPDATE contacts SET status = ?, locked_by = NULL WHERE id = ?')
            .bind('available', data.contactId).run();
          break;
        case 'COMPLETE_CONTACT':
          this.broadcast(JSON.stringify({ type: 'CONTACT_COMPLETED', contactId: data.contactId }), ws);
          await this.env.DB.prepare('UPDATE contacts SET status = ? WHERE id = ?')
            .bind('completed', data.contactId).run();
          break;
      }
    } catch (e) {
      console.error('Error handling websocket message', e);
    }
  }

  webSocketClose(ws: WebSocket, code: number, reason: string, wasClean: boolean) {
    this.sessions.delete(ws);
  }

  webSocketError(ws: WebSocket, error: unknown) {
    this.sessions.delete(ws);
  }

  private broadcast(message: string, excludeWs?: WebSocket) {
    for (const session of this.sessions) {
      if (session !== excludeWs) {
        session.send(message);
      }
    }
  }
}
