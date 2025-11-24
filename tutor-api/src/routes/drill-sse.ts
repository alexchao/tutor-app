import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { getAuth } from '@clerk/fastify';
import { db } from '../db/connection.js';
import { drillSessions } from '../db/schema.js';
import { eq, and } from 'drizzle-orm';
import { ablyClient } from '../lib/ably.js';

interface DrillStreamParams {
  sessionId: string;
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
      const channel = ablyClient.channels.get(`drill:${sessionIdNum}`);
      
      const messageHandler = (message: any) => {
        const data = JSON.stringify(message.data);
        reply.raw.write(`data: ${data}\n\n`);
      };

      await channel.subscribe('message', messageHandler);

      // Send heartbeat every 30 seconds to keep connection alive
      const heartbeatInterval = setInterval(() => {
        reply.raw.write(': heartbeat\n\n');
      }, 30000);

      // Handle client disconnect
      request.raw.on('close', async () => {
        clearInterval(heartbeatInterval);
        await channel.unsubscribe('message', messageHandler);
      });
    }
  );
}

