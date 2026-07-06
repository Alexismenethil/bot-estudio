CREATE TABLE "session_answers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"session_kind" text NOT NULL,
	"session_id" uuid NOT NULL,
	"question_id" uuid NOT NULL,
	"given_answer" text NOT NULL,
	"is_correct" boolean NOT NULL,
	"answered_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "session_answers_kind_session_question_unique" UNIQUE("session_kind","session_id","question_id"),
	CONSTRAINT "session_answers_session_kind_check" CHECK ("session_answers"."session_kind" in ('trainer','exam'))
);
--> statement-breakpoint
CREATE TABLE "trainer_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"scope_type" text NOT NULL,
	"scope_id" uuid NOT NULL,
	"question_ids" uuid[] NOT NULL,
	"current_index" integer DEFAULT 0 NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "trainer_sessions_scope_type_check" CHECK ("trainer_sessions"."scope_type" in ('topic','course')),
	CONSTRAINT "trainer_sessions_current_index_check" CHECK ("trainer_sessions"."current_index" >= 0),
	CONSTRAINT "trainer_sessions_status_check" CHECK ("trainer_sessions"."status" in ('active','finished'))
);
--> statement-breakpoint
ALTER TABLE "session_answers" ADD CONSTRAINT "session_answers_question_id_bank_questions_id_fk" FOREIGN KEY ("question_id") REFERENCES "public"."bank_questions"("id") ON DELETE cascade ON UPDATE no action;