import type { FastifyInstance } from 'fastify';
import type { SocketStream } from '@fastify/websocket';
import { config } from '../config.js';
import type { User, WSTopic, WSMessage } from '../types/index.js';
import { roleCanSubscribe } from '../middleware/rbac.js';

/**
 * WebSocket connection state
 */
interface WSConnection {
  socket: SocketStream['socket'];
  user: User;
  subscriptions: Set<string>; // "topic" or "topic:key"
  lastHeartbeat: number;
  seq: Map<string, number>; // Per-topic sequence numbers
}

// Active connections
const connections = new Map<string, WSConnection>();

// Subscription to connections mapping
const subscriptionIndex = new Map<string, Set<string>>(); // subscription -> connectionIds

/**
 * Generate subscription key
 */
function subKey(topic: WSTopic, key?: string): string {
  return key ? `${topic}:${key}` : topic;
}

/**
 * Send message to a specific connection
 */
function sendToConnection(conn: WSConnection, message: WSMessage): void {
  if (conn.socket.readyState === 1) {
    // WebSocket.OPEN
    try {
      conn.socket.send(JSON.stringify(message));
    } catch (err) {
      console.error('Failed to send WebSocket message:', err);
    }
  }
}

/**
 * Broadcast message to all subscribers of a topic
 */
export function broadcast(topic: WSTopic, data: unknown, key?: string): void {
  const subscription = subKey(topic, key);
  const connectionIds = subscriptionIndex.get(subscription);

  if (!connectionIds || connectionIds.size === 0) {
    return;
  }

  for (const connId of connectionIds) {
    const conn = connections.get(connId);
    if (conn) {
      // Increment sequence number for this topic
      const currentSeq = conn.seq.get(subscription) ?? 0;
      conn.seq.set(subscription, currentSeq + 1);

      const message: WSMessage = {
        v: 1,
        type: 'event',
        topic,
        key,
        seq: currentSeq + 1,
        ts: new Date().toISOString(),
        data,
      };

      sendToConnection(conn, message);
    }
  }
}

/**
 * Handle subscription request
 */
function handleSubscribe(conn: WSConnection, topic: WSTopic, key?: string): WSMessage {
  // Check if user can subscribe to this topic
  if (!roleCanSubscribe(conn.user.role, topic)) {
    return {
      v: 1,
      type: 'error',
      topic,
      key,
      ts: new Date().toISOString(),
      data: { error: 'Forbidden', details: `Role ${conn.user.role} cannot subscribe to ${topic}` },
    };
  }

  const subscription = subKey(topic, key);

  // Add to connection's subscriptions
  conn.subscriptions.add(subscription);
  conn.seq.set(subscription, 0);

  // Add to subscription index
  if (!subscriptionIndex.has(subscription)) {
    subscriptionIndex.set(subscription, new Set());
  }
  subscriptionIndex.get(subscription)!.add(conn.user.id);

  return {
    v: 1,
    type: 'ack',
    topic,
    key,
    seq: 0,
    ts: new Date().toISOString(),
  };
}

/**
 * Handle unsubscribe request
 */
function handleUnsubscribe(conn: WSConnection, topic: WSTopic, key?: string): WSMessage {
  const subscription = subKey(topic, key);

  // Remove from connection's subscriptions
  conn.subscriptions.delete(subscription);
  conn.seq.delete(subscription);

  // Remove from subscription index
  const subscribers = subscriptionIndex.get(subscription);
  if (subscribers) {
    subscribers.delete(conn.user.id);
    if (subscribers.size === 0) {
      subscriptionIndex.delete(subscription);
    }
  }

  return {
    v: 1,
    type: 'ack',
    topic,
    key,
    ts: new Date().toISOString(),
  };
}

/**
 * Clean up connection
 */
function cleanupConnection(connId: string): void {
  const conn = connections.get(connId);
  if (!conn) return;

  // Remove from all subscriptions
  for (const subscription of conn.subscriptions) {
    const subscribers = subscriptionIndex.get(subscription);
    if (subscribers) {
      subscribers.delete(connId);
      if (subscribers.size === 0) {
        subscriptionIndex.delete(subscription);
      }
    }
  }

  connections.delete(connId);
}

/**
 * Register WebSocket routes
 */
export async function registerWebSocket(fastify: FastifyInstance): Promise<void> {
  await fastify.register(import('@fastify/websocket'));

  // Heartbeat interval
  const heartbeatInterval = setInterval(() => {
    const now = Date.now();
    for (const [connId, conn] of connections) {
      // Check if connection is stale (no heartbeat in 2x interval)
      if (now - conn.lastHeartbeat > config.wsHeartbeatIntervalMs * 2) {
        fastify.log.info({ connId, user: conn.user.email }, 'Closing stale WebSocket connection');
        conn.socket.close(1000, 'Heartbeat timeout');
        cleanupConnection(connId);
        continue;
      }

      // Send heartbeat
      const heartbeat: WSMessage = {
        v: 1,
        type: 'heartbeat',
        topic: 'health',
        ts: new Date().toISOString(),
      };
      sendToConnection(conn, heartbeat);
    }
  }, config.wsHeartbeatIntervalMs);

  // Clean up on server close
  fastify.addHook('onClose', async () => {
    clearInterval(heartbeatInterval);
    for (const [connId, conn] of connections) {
      conn.socket.close(1000, 'Server shutdown');
      cleanupConnection(connId);
    }
  });

  // WebSocket route
  fastify.get(
    '/ws',
    {
      websocket: true,
      preHandler: [fastify.authenticate],
    },
    (connection, request) => {
      const user = request.nexriskUser!;
      const connId = `${user.id}-${Date.now()}`;

      // Check connection limit per user
      const userConnections = Array.from(connections.values()).filter(
        (c) => c.user.id === user.id
      );
      if (userConnections.length >= config.wsMaxConnectionsPerUser) {
        fastify.log.warn({ userId: user.id }, 'WebSocket connection limit exceeded');
        connection.socket.close(4429, 'Too many connections');
        return;
      }

      // Create connection state
      const conn: WSConnection = {
        socket: connection.socket,
        user,
        subscriptions: new Set(),
        lastHeartbeat: Date.now(),
        seq: new Map(),
      };

      connections.set(connId, conn);

      fastify.log.info({ connId, user: user.email }, 'WebSocket connection established');

      // Handle messages
      connection.socket.on('message', (raw: Buffer | string) => {
        try {
          const message = JSON.parse(raw.toString()) as WSMessage;
          conn.lastHeartbeat = Date.now();

          let response: WSMessage;

          switch (message.type) {
            case 'subscribe':
              response = handleSubscribe(conn, message.topic, message.key);
              break;

            case 'unsubscribe':
              response = handleUnsubscribe(conn, message.topic, message.key);
              break;

            case 'heartbeat':
              // Just update lastHeartbeat, no response needed
              return;

            default:
              response = {
                v: 1,
                type: 'error',
                topic: message.topic,
                ts: new Date().toISOString(),
                data: { error: 'Unknown message type' },
              };
          }

          sendToConnection(conn, response);
        } catch (err) {
          fastify.log.error({ err, connId }, 'Failed to process WebSocket message');
          const errorResponse: WSMessage = {
            v: 1,
            type: 'error',
            topic: 'health',
            ts: new Date().toISOString(),
            data: { error: 'Invalid message format' },
          };
          sendToConnection(conn, errorResponse);
        }
      });

      // Handle close
      connection.socket.on('close', () => {
        fastify.log.info({ connId, user: user.email }, 'WebSocket connection closed');
        cleanupConnection(connId);
      });

      // Handle error
      connection.socket.on('error', (err: Error) => {
        fastify.log.error({ err, connId }, 'WebSocket error');
        cleanupConnection(connId);
      });
    }
  );
}

/**
 * Get WebSocket stats for monitoring
 */
export function getWSStats(): {
  connections: number;
  subscriptions: number;
  byTopic: Record<string, number>;
} {
  const byTopic: Record<string, number> = {};

  for (const [subscription, subscribers] of subscriptionIndex) {
    const topic = subscription.split(':')[0];
    byTopic[topic] = (byTopic[topic] ?? 0) + subscribers.size;
  }

  return {
    connections: connections.size,
    subscriptions: subscriptionIndex.size,
    byTopic,
  };
}
