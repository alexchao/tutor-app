import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { getAuth } from '@clerk/fastify';
import { db } from '../db/connection.js';
import { drillSessions } from '../db/schema.js';
import { eq, and } from 'drizzle-orm';
import { ablyClient } from '../lib/ably.js';

interface DrillStreamParams {
  sessionId: string;
}

interface ActiveSSEConnection {
  reply: FastifyReply;
  heartbeatInterval: NodeJS.Timeout;
  messageHandler: (message: any) => void;
}

// Track all active SSE connections for graceful shutdown
const activeConnections = new Set<ActiveSSEConnection>();

export function closeAllSSEConnections(): void {
  for (const connection of activeConnections) {
    clearInterval(connection.heartbeatInterval);
    try {
      connection.reply.raw.end();
    } catch (frError) {
      // Connection may already be closed
      console.error('Received error closing fastify reply for SSE connection', frError);
    }
  }
  activeConnections.clear();
}

export async function registerDrillSSERoutes(fastify: FastifyInstance): Promise<void> {
  fastify.get(
    '/api/drill/stream/:sessionId',
    async (
      request: FastifyRequest<{ Params: DrillStreamParams }>,
      reply: FastifyReply
    ) => {
      const { sessionId } = request.params;
      const sessionIdNum = parseInt(sessionId, 10);

      if (isNaN(sessionIdNum)) {
        return reply.code(400).send({ error: 'Invalid session ID' });
      }

      // Get user ID from Clerk
      const { userId } = getAuth(request);
      if (!userId) {
        return reply.code(401).send({ error: 'Unauthorized' });
      }

      // Validate user owns the session
      const [session] = await db
        .select()
        .from(drillSessions)
        .where(
          and(eq(drillSessions.id, sessionIdNum), eq(drillSessions.userId, userId))
        )
        .limit(1);

      if (!session) {
        return reply.code(404).send({ error: 'Session not found or access denied' });
      }

      // Set SSE headers
      reply.raw.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
        'Access-Control-Allow-Origin': '*',
      });

      // Subscribe to Ably channel
      const channelName = `drill:${sessionIdNum}`;
      const channel = ablyClient.channels.get(channelName);

      const messageHandler = (message: any) => {
        const data = JSON.stringify(message.data);
        reply.raw.write(`data: ${data}\n\n`);
      };

      await channel.subscribe('message', messageHandler);

      // Send heartbeat every 30 seconds to keep connection alive
      const heartbeatInterval = setInterval(() => {
        reply.raw.write(': heartbeat\n\n');
      }, 30000);

      // Track this connection
      const connection: ActiveSSEConnection = {
        reply,
        heartbeatInterval,
        messageHandler,
      };
      activeConnections.add(connection);

      // Handle client disconnect
      request.raw.on('close', async () => {
        clearInterval(heartbeatInterval);
        await channel.unsubscribe('message', messageHandler);
        activeConnections.delete(connection);
      });
    }
  );
}

