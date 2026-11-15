import type { Server as HttpServer } from 'node:http';
import { WebSocket, WebSocketServer } from 'ws';
import { ADMIN_COOKIE, SESSION_COOKIE, verifySignedToken } from './auth.ts';

const userSockets = new Map<number, Set<WebSocket>>();

function parseCookies(header: string | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  if (!header) return out;
  for (const part of header.split(';')) {
    const idx = part.indexOf('=');
    if (idx === -1) continue;
    const key = part.slice(0, idx).trim();
    const val = decodeURIComponent(part.slice(idx + 1).trim());
    out[key] = val;
  }
  return out;
}

export function getOnlineUserIds(): number[] {
  return Array.from(userSockets.keys());
}

export function emitToUser(userId: number, event: string, data: unknown): void {
  const sockets = userSockets.get(userId);
  if (!sockets || sockets.size === 0) return;
  const payload = JSON.stringify({ event, data });
  for (const ws of sockets) {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(payload);
    }
  }
}

function broadcastPresence() {
  const onlineIds = getOnlineUserIds();
  const payload = JSON.stringify({ event: 'presence:update', data: { onlineIds } });
  for (const sockets of userSockets.values()) {
    for (const ws of sockets) {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(payload);
      }
    }
  }
}

export function initWebSocketServer(server: HttpServer) {
  const wss = new WebSocketServer({ server, path: '/ws' });

  wss.on('connection', (ws, req) => {
    const cookies = parseCookies(req.headers.cookie);
    let queryToken = '';
    try {
      const parsedUrl = new URL(req.url || '/ws', 'http://localhost');
      queryToken = parsedUrl.searchParams.get('token') || '';
    } catch {
      queryToken = '';
    }
    const sessionToken = queryToken || cookies[SESSION_COOKIE];
    const payload = sessionToken
      ? verifySignedToken<{ userId?: number }>(sessionToken)
      : null;

    if (!payload?.userId) {
      const adminToken = cookies[ADMIN_COOKIE];
      if (!adminToken) {
        ws.close(4001, 'Unauthorized');
        return;
      }
    }

    const userId = payload?.userId;
    if (!userId) {
      ws.close(4001, 'Unauthorized');
      return;
    }

    let set = userSockets.get(userId);
    if (!set) {
      set = new Set();
      userSockets.set(userId, set);
    }
    set.add(ws);

    ws.send(
      JSON.stringify({
        event: 'presence:update',
        data: { onlineIds: getOnlineUserIds() },
      })
    );
    broadcastPresence();

    ws.on('message', (raw) => {
      try {
        const msg = JSON.parse(raw.toString()) as {
          event?: string;
          data?: { recipientId?: number; conversationId?: number; isTyping?: boolean };
        };
        if (msg.event === 'typing' && msg.data?.recipientId && msg.data?.conversationId) {
          emitToUser(msg.data.recipientId, 'typing', {
            conversationId: msg.data.conversationId,
            userId,
            isTyping: Boolean(msg.data.isTyping),
          });
        }
      } catch {
        // Ignore malformed client frames
      }
    });

    ws.on('close', () => {
      const existing = userSockets.get(userId);
      if (existing) {
        existing.delete(ws);
        if (existing.size === 0) {
          userSockets.delete(userId);
        }
      }
      broadcastPresence();
    });
  });

  return wss;
}
