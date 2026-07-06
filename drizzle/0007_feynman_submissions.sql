CREATE TABLE "ai_evaluations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"submission_id" uuid NOT NULL,
	"engine" text NOT NULL,
	"correct_points" jsonb NOT NULL,
	"missing_points" jsonb NOT NULL,
	"wrong_points" jsonb NOT NULL,
	"review_suggestions" jsonb NOT NULL,
	"citations" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ai_evaluations_engine_check" CHECK ("ai_evaluations"."engine" in ('gemini','local'))
);
--> statement-breakpoint
CREATE TABLE "feynman_submissions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"topic_id" uuid NOT NULL,
	"explanation" text NOT NULL,
	"status" text DEFAULT 'submitted' NOT NULL,
	"failure_classes" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "feynman_submissions_explanation_length_check" CHECK (length(trim("feynman_submissions"."explanation")) > 0 and length("feynman_submissions"."explanation") <= 20000),
	CONSTRAINT "feynman_submissions_status_check" CHECK ("feynman_submissions"."status" in ('submitted','pending_retry','evaluated'))
);
--> statement-breakpoint
ALTER TABLE "ai_evaluations" ADD CONSTRAINT "ai_evaluations_submission_id_feynman_submissions_id_fk" FOREIGN KEY ("submission_id") REFERENCES "public"."feynman_submissions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "feynman_submissions" ADD CONSTRAINT "feynman_submissions_topic_id_topics_id_fk" FOREIGN KEY ("topic_id") REFERENCES "public"."topics"("id") ON DELETE cascade ON UPDATE no action;