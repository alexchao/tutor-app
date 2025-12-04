import { z } from 'zod';
import { protectedProcedure } from '../procedures.js';
import { db } from '../db/connection.js';
import { drillSessions, learningTopics } from '../db/schema.js';
import { eq, and, desc, isNotNull } from 'drizzle-orm';
import { TRPCError } from '@trpc/server';
import { DBOS } from '@dbos-inc/dbos-sdk';
import { processDrillMessageWorkflow, generateDrillPlanWorkflow, summarizeDrillSessionWorkflow } from '../domains/drill/workflows/index.js';

const focusSelectionSchema = z.discriminatedUnion('focusType', [
  z.object({
    focusType: z.literal('custom'),
    value: z.string().min(1),
  }),
  z.object({
    focusType: z.literal('previous-focus-areas'),
    sourceSessionId: z.number(),
    focusAreas: z.array(z.string()),
  }),
]).nullable();

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

      // Start drill plan generation workflow in background (fire-and-forget)
      // This will generate the plan, update status to 'ready', and trigger the first AI message
      DBOS.startWorkflow(generateDrillPlanWorkflow)({
        sessionId: session.id,
        userId: ctx.userId,
      });

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

  finishSession: protectedProcedure
    .input(z.object({ sessionId: z.number() }))
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

      const now = new Date();

      // Update status to 'chat-completed' and set chatCompletedAt
      await db
        .update(drillSessions)
        .set({
          status: 'chat-completed',
          chatCompletedAt: now,
        })
        .where(eq(drillSessions.id, input.sessionId));

      // Update lastPracticedAt on the learning topic
      await db
        .update(learningTopics)
        .set({
          lastPracticedAt: now,
        })
        .where(eq(learningTopics.id, session.learningTopicId));

      // Start summarization workflow in background (returns handle, doesn't wait for completion)
      await DBOS.startWorkflow(summarizeDrillSessionWorkflow)({
        sessionId: input.sessionId,
        userId: ctx.userId,
      });

      return { success: true };
    }),

  getSessionResults: protectedProcedure
    .input(z.object({ sessionId: z.number() }))
    .query(async ({ input, ctx }) => {
      const [session] = await db
        .select({
          id: drillSessions.id,
          status: drillSessions.status,
          drillPlan: drillSessions.drillPlan,
          completionData: drillSessions.completionData,
        })
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

  getRecentCompletedSessions: protectedProcedure
    .input(z.object({ learningTopicId: z.number() }))
    .query(async ({ input, ctx }) => {
      const sessions = await db
        .select({
          id: drillSessions.id,
          chatCompletedAt: drillSessions.chatCompletedAt,
          completionData: drillSessions.completionData,
        })
        .from(drillSessions)
        .where(
          and(
            eq(drillSessions.learningTopicId, input.learningTopicId),
            eq(drillSessions.userId, ctx.userId),
            isNotNull(drillSessions.chatCompletedAt),
            isNotNull(drillSessions.completionData)
          )
        )
        .orderBy(desc(drillSessions.chatCompletedAt))
        .limit(3);

      return sessions;
    }),
};

