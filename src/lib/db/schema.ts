import {
  boolean,
  date,
  integer,
  jsonb,
  pgTable,
  real,
  text,
  timestamp,
  unique,
  check,
  index,
  vector,
  uuid,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

// courses / topics (US2; FR-009) — data-model.md
export const courses = pgTable("courses", {
  id: uuid("id").primaryKey().defaultRandom(),
  code: text("code").notNull().unique(),
  name: text("name").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const topics = pgTable(
  "topics",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    courseId: uuid("course_id")
      .notNull()
      .references(() => courses.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [unique("topics_course_id_name_unique").on(table.courseId, table.name)],
);

// documents / document_chunks (US1; FR-001, FR-002, FR-004, FR-005) — data-model.md
export const documents = pgTable(
  "documents",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    topicId: uuid("topic_id")
      .notNull()
      .references(() => topics.id),
    title: text("title").notNull(),
    blobUrl: text("blob_url").notNull(),
    pageCount: integer("page_count").notNull(),
    status: text("status").notNull().default("processing"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    check("documents_page_count_positive", sql`${table.pageCount} > 0`),
    check("documents_status_check", sql`${table.status} in ('processing','ready','failed')`),
  ],
);

export const documentChunks = pgTable(
  "document_chunks",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    documentId: uuid("document_id")
      .notNull()
      .references(() => documents.id, { onDelete: "cascade" }),
    // Upper bound (<= documents.page_count) is app-layer only — Postgres
    // CHECK constraints cannot reference another table (data-model.md).
    pageNumber: integer("page_number").notNull(),
    chunkIndex: integer("chunk_index").notNull(),
    content: text("content").notNull(),
    embedding: vector("embedding", { dimensions: 384 }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    unique("document_chunks_document_id_chunk_index_unique").on(table.documentId, table.chunkIndex),
    check("document_chunks_page_number_check", sql`${table.pageNumber} >= 1`),
    index("document_chunks_embedding_hnsw_idx").using("hnsw", table.embedding.op("vector_cosine_ops")),
  ],
);

// assistant_threads / assistant_messages (US1; FR-003-FR-007, FR-030) — data-model.md
export const assistantThreads = pgTable("assistant_threads", {
  id: uuid("id").primaryKey().defaultRandom(),
  documentId: uuid("document_id")
    .notNull()
    .references(() => documents.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const assistantMessages = pgTable(
  "assistant_messages",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    threadId: uuid("thread_id")
      .notNull()
      .references(() => assistantThreads.id, { onDelete: "cascade" }),
    role: text("role").notNull(),
    content: text("content").notNull(),
    // 'pending_retry' preserves an unanswered user question (FR-030, US1-AC8).
    status: text("status").notNull(),
    engine: text("engine"),
    // jsonb array of {page: int, chunkId: uuid}; every grounded answer has >= 1.
    citations: jsonb("citations"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    check("assistant_messages_role_check", sql`${table.role} in ('user','assistant')`),
    check("assistant_messages_status_check", sql`${table.status} in ('ok','pending_retry')`),
    check(
      "assistant_messages_engine_check",
      sql`${table.engine} is null or ${table.engine} in ('gemini','local')`,
    ),
  ],
);

const sm2Columns = {
  nextReviewAt: date("next_review_at").notNull().default(sql`CURRENT_DATE`),
  intervalDays: integer("interval_days").notNull().default(0),
  easeFactor: real("ease_factor").notNull().default(2.5),
  repetitions: integer("repetitions").notNull().default(0),
  lastOutcome: text("last_outcome"),
};

// flashcards / bank_questions / review_logs (US2; FR-010-FR-014, FR-018) — data-model.md
export const flashcards = pgTable(
  "flashcards",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    topicId: uuid("topic_id")
      .notNull()
      .references(() => topics.id, { onDelete: "cascade" }),
    front: text("front").notNull(),
    back: text("back").notNull(),
    ...sm2Columns,
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    check("flashcards_interval_days_check", sql`${table.intervalDays} >= 0`),
    check("flashcards_ease_factor_check", sql`${table.easeFactor} >= 1.3`),
    check("flashcards_repetitions_check", sql`${table.repetitions} >= 0`),
    check(
      "flashcards_last_outcome_check",
      sql`${table.lastOutcome} is null or ${table.lastOutcome} in ('correct','incorrect','hard')`,
    ),
  ],
);

export const bankQuestions = pgTable(
  "bank_questions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    topicId: uuid("topic_id")
      .notNull()
      .references(() => topics.id, { onDelete: "cascade" }),
    prompt: text("prompt").notNull(),
    correctAnswer: text("correct_answer").notNull(),
    explanation: text("explanation").notNull(),
    ...sm2Columns,
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    check("bank_questions_interval_days_check", sql`${table.intervalDays} >= 0`),
    check("bank_questions_ease_factor_check", sql`${table.easeFactor} >= 1.3`),
    check("bank_questions_repetitions_check", sql`${table.repetitions} >= 0`),
    check(
      "bank_questions_last_outcome_check",
      sql`${table.lastOutcome} is null or ${table.lastOutcome} in ('correct','incorrect','hard')`,
    ),
  ],
);

export const reviewLogs = pgTable(
  "review_logs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    itemType: text("item_type").notNull(),
    itemId: uuid("item_id").notNull(),
    context: text("context").notNull(),
    outcome: text("outcome").notNull(),
    scheduleChanged: boolean("schedule_changed").notNull(),
    prevState: jsonb("prev_state").notNull(),
    newState: jsonb("new_state").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    check("review_logs_item_type_check", sql`${table.itemType} in ('flashcard','bank_question')`),
    check("review_logs_context_check", sql`${table.context} in ('review','trainer','exam')`),
    check("review_logs_outcome_check", sql`${table.outcome} in ('correct','incorrect','hard')`),
  ],
);

// trainer_sessions / session_answers (US3; FR-015-FR-018, FR-029, FR-031) — data-model.md
export const trainerSessions = pgTable(
  "trainer_sessions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    scopeType: text("scope_type").notNull(),
    scopeId: uuid("scope_id").notNull(),
    questionIds: uuid("question_ids").array().notNull(),
    currentIndex: integer("current_index").notNull().default(0),
    status: text("status").notNull().default("active"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    check("trainer_sessions_scope_type_check", sql`${table.scopeType} in ('topic','course')`),
    check("trainer_sessions_current_index_check", sql`${table.currentIndex} >= 0`),
    check("trainer_sessions_status_check", sql`${table.status} in ('active','finished')`),
  ],
);

export const sessionAnswers = pgTable(
  "session_answers",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    sessionKind: text("session_kind").notNull(),
    sessionId: uuid("session_id").notNull(),
    questionId: uuid("question_id")
      .notNull()
      .references(() => bankQuestions.id, { onDelete: "cascade" }),
    givenAnswer: text("given_answer").notNull(),
    isCorrect: boolean("is_correct").notNull(),
    answeredAt: timestamp("answered_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    unique("session_answers_kind_session_question_unique").on(
      table.sessionKind,
      table.sessionId,
      table.questionId,
    ),
    check("session_answers_session_kind_check", sql`${table.sessionKind} in ('trainer','exam')`),
  ],
);
