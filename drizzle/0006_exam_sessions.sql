CREATE TABLE "exam_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"scope_type" text NOT NULL,
	"scope_id" uuid NOT NULL,
	"question_ids" uuid[] NOT NULL,
	"duration_seconds" integer NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"finalized_at" timestamp with time zone,
	"total_questions" integer,
	"correct_count" integer,
	CONSTRAINT "exam_sessions_scope_type_check" CHECK ("exam_sessions"."scope_type" in ('topic','course')),
	CONSTRAINT "exam_sessions_duration_seconds_check" CHECK ("exam_sessions"."duration_seconds" > 0),
	CONSTRAINT "exam_sessions_status_check" CHECK ("exam_sessions"."status" in ('active','finished')),
	CONSTRAINT "exam_sessions_total_questions_check" CHECK ("exam_sessions"."total_questions" is null or "exam_sessions"."total_questions" >= 0),
	CONSTRAINT "exam_sessions_correct_count_check" CHECK ("exam_sessions"."correct_count" is null or "exam_sessions"."correct_count" >= 0)
);
