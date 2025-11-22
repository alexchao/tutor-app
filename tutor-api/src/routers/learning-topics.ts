import { z } from 'zod';
import { protectedProcedure } from '../procedures.js';
import { db } from '../db/connection.js';
import { learningTopics } from '../db/schema.js';
import { desc } from 'drizzle-orm';

export const learningTopicsRouter = {
  list: protectedProcedure.query(async () => {
    return await db
      .select()
      .from(learningTopics)
      .orderBy(desc(learningTopics.createdAt));
  }),

  create: protectedProcedure
    .input(
      z.object({
        title: z.string().min(1, 'Title is required'),
        contentMd: z.string().min(1, 'Content is required'),
      })
    )
    .mutation(async ({ input }) => {
      const [newTopic] = await db
        .insert(learningTopics)
        .values(input)
        .returning();
      return newTopic;
    }),
};

