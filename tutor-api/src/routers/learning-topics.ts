import { z } from 'zod';
import { protectedProcedure } from '../procedures.js';
import { db } from '../db/connection.js';
import { learningTopics } from '../db/schema.js';
import { desc, eq, sql } from 'drizzle-orm';

export const learningTopicsRouter = {
  list: protectedProcedure.query(async ({ ctx }) => {
    return await db
      .select()
      .from(learningTopics)
      .where(eq(learningTopics.userId, ctx.userId))
      .orderBy(
        // Sort by lastPracticedAt ascending, with nulls first (never practiced topics at top)
        sql`${learningTopics.lastPracticedAt} NULLS FIRST`,
        // Then by createdAt descending as a tiebreaker
        desc(learningTopics.createdAt)
      );
  }),

  create: protectedProcedure
    .input(
      z.object({
        title: z.string().min(1, 'Title is required'),
        contentMd: z.string().min(1, 'Content is required'),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const [newTopic] = await db
        .insert(learningTopics)
        .values({
          ...input,
          userId: ctx.userId,
        })
        .returning();
      return newTopic;
    }),
};

