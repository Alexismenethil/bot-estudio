CREATE TABLE "bank_questions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"topic_id" uuid NOT NULL,
	"prompt" text NOT NULL,
	"correct_answer" text NOT NULL,
	"explanation" text NOT NULL,
	"next_review_at" date DEFAULT CURRENT_DATE NOT NULL,
	"interval_days" integer DEFAULT 0 NOT NULL,
	"ease_factor" real DEFAULT 2.5 NOT NULL,
	"repetitions" integer DEFAULT 0 NOT NULL,
	"last_outcome" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "bank_questions_interval_days_check" CHECK ("bank_questions"."interval_days" >= 0),
	CONSTRAINT "bank_questions_ease_factor_check" CHECK ("bank_questions"."ease_factor" >= 1.3),
	CONSTRAINT "bank_questions_repetitions_check" CHECK ("bank_questions"."repetitions" >= 0),
	CONSTRAINT "bank_questions_last_outcome_check" CHECK ("bank_questions"."last_outcome" is null or "bank_questions"."last_outcome" in ('correct','incorrect','hard'))
);
--> statement-breakpoint
CREATE TABLE "flashcards" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"topic_id" uuid NOT NULL,
	"front" text NOT NULL,
	"back" text NOT NULL,
	"next_review_at" date DEFAULT CURRENT_DATE NOT NULL,
	"interval_days" integer DEFAULT 0 NOT NULL,
	"ease_factor" real DEFAULT 2.5 NOT NULL,
	"repetitions" integer DEFAULT 0 NOT NULL,
	"last_outcome" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "flashcards_interval_days_check" CHECK ("flashcards"."interval_days" >= 0),
	CONSTRAINT "flashcards_ease_factor_check" CHECK ("flashcards"."ease_factor" >= 1.3),
	CONSTRAINT "flashcards_repetitions_check" CHECK ("flashcards"."repetitions" >= 0),
	CONSTRAINT "flashcards_last_outcome_check" CHECK ("flashcards"."last_outcome" is null or "flashcards"."last_outcome" in ('correct','incorrect','hard'))
);
--> statement-breakpoint
CREATE TABLE "review_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"item_type" text NOT NULL,
	"item_id" uuid NOT NULL,
	"context" text NOT NULL,
	"outcome" text NOT NULL,
	"schedule_changed" boolean NOT NULL,
	"prev_state" jsonb NOT NULL,
	"new_state" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "review_logs_item_type_check" CHECK ("review_logs"."item_type" in ('flashcard','bank_question')),
	CONSTRAINT "review_logs_context_check" CHECK ("review_logs"."context" in ('review','trainer','exam')),
	CONSTRAINT "review_logs_outcome_check" CHECK ("review_logs"."outcome" in ('correct','incorrect','hard'))
);
--> statement-breakpoint
ALTER TABLE "bank_questions" ADD CONSTRAINT "bank_questions_topic_id_topics_id_fk" FOREIGN KEY ("topic_id") REFERENCES "public"."topics"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "flashcards" ADD CONSTRAINT "flashcards_topic_id_topics_id_fk" FOREIGN KEY ("topic_id") REFERENCES "public"."topics"("id") ON DELETE cascade ON UPDATE no action;