import { pgTable, serial, text, timestamp, integer, jsonb, pgEnum } from 'drizzle-orm/pg-core';

export const learningTopics = pgTable('learning_topics', {
  id: serial('id').primaryKey(),
  userId: text('user_id').notNull(),
  title: text('title').notNull(),
  contentMd: text('content_md').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull().$onUpdate(() => new Date()),
});

// Type-safe interfaces for selecting and inserting records
export type LearningTopic = typeof learningTopics.$inferSelect;
export type NewLearningTopic = typeof learningTopics.$inferInsert;

// Grading type enum
export const gradingTypeEnum = pgEnum('grading_type', ['no-rubric-criteria']);

// Practice question submissions table
export const practiceQuestionSubmissions = pgTable('practice_question_submissions', {
  id: serial('id').primaryKey(),
  learningTopicId: integer('learning_topic_id').notNull().references(() => learningTopics.id),
  questionPrompt: text('question_prompt').notNull(),
  studentResponse: text('student_response').notNull(),
  gradingStartedAt: timestamp('grading_started_at'),
  gradingCompletedAt: timestamp('grading_completed_at'),
  gradingType: gradingTypeEnum('grading_type').notNull(),
  gradingResult: jsonb('grading_result'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export type PracticeQuestionSubmission = typeof practiceQuestionSubmissions.$inferSelect;
export type NewPracticeQuestionSubmission = typeof practiceQuestionSubmissions.$inferInsert;

// Drill sessions table
export const drillSessions = pgTable('drill_sessions', {
  id: serial('id').primaryKey(),
  learningTopicId: integer('learning_topic_id').notNull().references(() => learningTopics.id),
  userId: text('user_id').notNull(),
  focusSelection: jsonb('focus_selection'),
  sessionData: jsonb('session_data'),
  status: text('status').default('preparing').notNull(),
  drillPlan: jsonb('drill_plan'),
  chatCompletedAt: timestamp('chat_completed_at'),
  completionData: jsonb('completion_data'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull().$onUpdate(() => new Date()),
});

export type DrillSession = typeof drillSessions.$inferSelect;
export type NewDrillSession = typeof drillSessions.$inferInsert;

