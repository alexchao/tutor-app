import { pgTable, serial, text, timestamp } from 'drizzle-orm/pg-core';

export const learningTopics = pgTable('learning_topics', {
  id: serial('id').primaryKey(),
  title: text('title').notNull(),
  contentMd: text('content_md').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull().$onUpdate(() => new Date()),
});

// Type-safe interfaces for selecting and inserting records
export type LearningTopic = typeof learningTopics.$inferSelect;
export type NewLearningTopic = typeof learningTopics.$inferInsert;

