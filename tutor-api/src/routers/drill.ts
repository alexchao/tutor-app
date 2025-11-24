import { z } from 'zod';
import { protectedProcedure } from '../procedures.js';
import { db } from '../db/connection.js';
import { drillSessions, learningTopics } from '../db/schema.js';
import { eq, and } from 'drizzle-orm';
import { TRPCError } from '@trpc/server';
import { DBOS } from '@dbos-inc/dbos-sdk';
import { processDrillMessageWorkflow } from '../domains/drill/workflows/index.js';

const focusSelectionSchema = z.object({
  focusType: z.literal('custom'),
  value: z.string().min(1),
}).nullable();

export const drillRouter = {
  createSession: protectedProcedure
    .input(
      z.object({
        learningTopicId: z.number(),
        focusSelection: focusSelectionSchema.optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      // Validate user owns the learning topic
      const [topic] = await db
        .select()
        .from(learningTopics)
        .where(
          and(
            eq(learningTopics.id, input.learningTopicId),
            eq(learningTopics.userId, ctx.userId)
          )
        )
        .limit(1);

      if (!topic) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Learning topic not found or you do not have access to it',
        });
      }

      // Create drill session
      const [session] = await db
        .insert(drillSessions)
        .values({
          learningTopicId: input.learningTopicId,
          userId: ctx.userId,
          focusSelection: input.focusSelection ?? null,
        })
        .returning();

      if (!session) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to create drill session',
        });
      }

      return { sessionId: session.id };
    }),

  getSession: protectedProcedure
    .input(z.object({ sessionId: z.number() }))
    .query(async ({ input, ctx }) => {
      const [session] = await db
        .select()
        .from(drillSessions)
        .where(
          and(
            eq(drillSessions.id, input.sessionId),
            eq(drillSessions.userId, ctx.userId)
          )
        )
        .limit(1);

      if (!session) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Drill session not found or you do not have access to it',
        });
      }

      return session;
    }),

  sendMessage: protectedProcedure
    .input(
      z.object({
        sessionId: z.number(),
        message: z.string().min(1, 'Message cannot be empty'),
      })
    )
    .mutation(async ({ input, ctx }) => {
      // Validate user owns the session
      const [session] = await db
        .select()
        .from(drillSessions)
        .where(
          and(
            eq(drillSessions.id, input.sessionId),
            eq(drillSessions.userId, ctx.userId)
          )
        )
        .limit(1);

      if (!session) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Drill session not found or you do not have access to it',
        });
      }

      // Generate message ID
      const messageId = crypto.randomUUID();

      // Start workflow in background (don't await)
      DBOS.startWorkflow(processDrillMessageWorkflow)({
        sessionId: input.sessionId,
        messageId,
        userMessage: input.message,
        userId: ctx.userId,
      });

      return { messageId };
    }),
};

