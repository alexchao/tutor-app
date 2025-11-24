import { z } from 'zod';
import { protectedProcedure } from '../procedures.js';
import { db } from '../db/connection.js';
import { practiceQuestionSubmissions } from '../db/schema.js';
import { eq } from 'drizzle-orm';
import { gradeSubmissionWorkflow } from '../domains/brain-dump/workflows/index.js';
import { DBOS } from '@dbos-inc/dbos-sdk';

export const practiceRouter = {
  submitBrainDump: protectedProcedure
    .input(
      z.object({
        learningTopicId: z.number(),
        questionPrompt: z.string(),
        studentResponse: z.string().min(1, 'Response cannot be empty'),
      })
    )
    .mutation(async ({ input }) => {
      // Create submission record
      const [submission] = await db
        .insert(practiceQuestionSubmissions)
        .values({
          learningTopicId: input.learningTopicId,
          questionPrompt: input.questionPrompt,
          studentResponse: input.studentResponse,
          gradingType: 'no-rubric-criteria',
        })
        .returning();

      if (!submission) {
        throw new Error('Failed to create submission');
      }

      // Trigger async grading workflow in the background
      await DBOS.startWorkflow(gradeSubmissionWorkflow)({ submissionId: submission.id });

      // Return submission ID immediately
      return { submissionId: submission.id };
    }),

  getSubmissionResult: protectedProcedure
    .input(z.object({ submissionId: z.number() }))
    .query(async ({ input }) => {
      const [submission] = await db
        .select()
        .from(practiceQuestionSubmissions)
        .where(eq(practiceQuestionSubmissions.id, input.submissionId))
        .limit(1);

      return submission ?? null;
    }),
};

