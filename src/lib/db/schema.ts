import { pgTable, uuid, text, integer, timestamp, unique, check, index, vector, jsonb } from "drizzle-orm/pg-core";
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
