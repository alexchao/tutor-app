CREATE TABLE "drill_sessions" (
	"id" serial PRIMARY KEY NOT NULL,
	"learning_topic_id" integer NOT NULL,
	"user_id" text NOT NULL,
	"focus_selection" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "learning_topics" ADD COLUMN "user_id" text NOT NULL;--> statement-breakpoint
ALTER TABLE "drill_sessions" ADD CONSTRAINT "drill_sessions_learning_topic_id_learning_topics_id_fk" FOREIGN KEY ("learning_topic_id") REFERENCES "public"."learning_topics"("id") ON DELETE no action ON UPDATE no action;