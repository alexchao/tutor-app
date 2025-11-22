CREATE TABLE "learning_topics" (
	"id" serial PRIMARY KEY NOT NULL,
	"title" text NOT NULL,
	"content_md" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
