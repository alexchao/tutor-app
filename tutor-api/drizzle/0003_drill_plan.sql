ALTER TABLE "drill_sessions" ADD COLUMN "status" text DEFAULT 'preparing' NOT NULL;--> statement-breakpoint
ALTER TABLE "drill_sessions" ADD COLUMN "drill_plan" jsonb;
