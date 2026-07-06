# Data Model: Personal Study App Core Features

**Feature**: `001-study-app-mvp` | **Date**: 2026-07-05
**Store**: Neon Postgres (+`pgvector`), Drizzle ORM. PDF binaries in Vercel Blob (URL referenced from `documents`). Client-side IndexedDB mirrors `document_chunks` per opened document (offline retrieval cache, R1-Scenario B).

## Conventions

- All PKs are `uuid` (default `gen_random_uuid()`); all tables carry `created_at timestamptz default now()`.
- Timestamps are UTC; "due today" is computed against the student's timezone at query time, not stored.
- The SM-2 scheduling state is an identical column group on `flashcards` and `bank_questions` (they are the two concrete "spaced-repetition items" of FR-013/FR-018). The engine operates on the shared `ReviewState` shape (see contracts/engine.md); no separate polymorphic table (Principle VII).

## Entities

### courses
| Column | Type | Constraints |
|---|---|---|
| id | uuid | PK |
| code | text | NOT NULL, UNIQUE — free-form label, e.g. "IS-481" |
| name | text | NOT NULL |

### topics
| Column | Type | Constraints |
|---|---|---|
| id | uuid | PK |
| course_id | uuid | FK → courses, NOT NULL, ON DELETE CASCADE |
| name | text | NOT NULL; UNIQUE (course_id, name) |

### documents  *(US1; FR-001, FR-002)*
| Column | Type | Constraints |
|---|---|---|
| id | uuid | PK |
| topic_id | uuid | FK → topics, NOT NULL — exactly one Topic (clarification 2026-07-05) |
| title | text | NOT NULL |
| blob_url | text | NOT NULL — Vercel Blob location of the PDF |
| page_count | integer | NOT NULL, > 0 |
| status | text | NOT NULL, CHECK in ('processing','ready','failed') — upload edge case surfaces 'failed' |

State transitions: `processing → ready` (chunks embedded) · `processing → failed` (non-PDF/corrupt; explicit error to user, spec edge case). Only `ready` documents are openable.

### document_chunks  *(RAG index; FR-004, FR-005)*
| Column | Type | Constraints |
|---|---|---|
| id | uuid | PK |
| document_id | uuid | FK → documents, NOT NULL, ON DELETE CASCADE |
| page_number | integer | NOT NULL, CHECK ≥ 1 — the citation source of truth. Upper bound (`≤ documents.page_count`) is NOT a DB CHECK (Postgres cannot reference another table in a CHECK constraint); it is enforced in the application layer by the single write path (`POST /api/documents` ingestion, zod-validated against the just-created document's `page_count`) |
| chunk_index | integer | NOT NULL; UNIQUE (document_id, chunk_index) |
| content | text | NOT NULL — page-aware chunk (~400 tokens, never spans pages) |
| embedding | vector(384) | NOT NULL — multilingual-e5-small (R3) |

Index: HNSW on `embedding` (cosine), filtered queries always scoped by `document_id` (single-document assistant, spec assumption).

### SM-2 column group *(embedded in flashcards and bank_questions; FR-011, FR-013, FR-018)*
| Column | Type | Constraints |
|---|---|---|
| next_review_at | date | NOT NULL, default CURRENT_DATE — new item due same day (FR-011, US2-AC1) |
| interval_days | integer | NOT NULL, ≥ 0, default 0 |
| ease_factor | real | NOT NULL, CHECK ≥ 1.3, default 2.5 (FR-013, US2-AC4) |
| repetitions | integer | NOT NULL, ≥ 0, default 0 — consecutive-correct count (SM-2) |
| last_outcome | text | NULL, CHECK in ('correct','incorrect','hard') |

### flashcards  *(US2; FR-010)*
`id, topic_id FK NOT NULL CASCADE, front text NOT NULL, back text NOT NULL` + SM-2 column group.

### bank_questions  *(US3/US4; FR-031)*
`id, topic_id FK NOT NULL CASCADE, prompt text NOT NULL, correct_answer text NOT NULL, explanation text NOT NULL` + SM-2 column group.

### review_logs  *(Principle VIII + traceability of the asymmetric rule)*
| Column | Type | Constraints |
|---|---|---|
| id | uuid | PK |
| item_type | text | NOT NULL, CHECK in ('flashcard','bank_question') |
| item_id | uuid | NOT NULL |
| context | text | NOT NULL, CHECK in ('review','trainer','exam') |
| outcome | text | NOT NULL, CHECK in ('correct','incorrect','hard') |
| schedule_changed | boolean | NOT NULL — MUST be false for context∈{trainer,exam} with outcome='correct' (FR-018 asymmetry, US2-AC7) |
| prev_state / new_state | jsonb | NOT NULL — ReviewState snapshots for audit/debugging |

### trainer_sessions  *(US3; FR-015, FR-029)*
| Column | Type | Constraints |
|---|---|---|
| id | uuid | PK |
| scope_type | text | NOT NULL, CHECK in ('topic','course') |
| scope_id | uuid | NOT NULL |
| question_ids | uuid[] | NOT NULL — frozen draw order at start |
| current_index | integer | NOT NULL, ≥ 0, default 0 — resume point (FR-029) |
| status | text | NOT NULL, CHECK in ('active','finished') |

### exam_sessions  *(US4; FR-019, FR-020, FR-021, FR-029)*
| Column | Type | Constraints |
|---|---|---|
| id | uuid | PK |
| scope_type / scope_id | text / uuid | as trainer_sessions |
| question_ids | uuid[] | NOT NULL — frozen draw |
| duration_seconds | integer | NOT NULL, > 0 (spec assumption: any positive duration) |
| started_at | timestamptz | NOT NULL — server-authoritative timer origin (R11) |
| status | text | NOT NULL, CHECK in ('active','finished') |
| finalized_at | timestamptz | NULL — set once, at manual finish or first observation past deadline |
| total_questions / correct_count | integer | NULL until finalized; then NOT NULL (Score Report aggregates, FR-021) |

State transitions: `active → finished` only. Finalization is idempotent and triggered by: student finishes, timer reaches zero while open, or any server read/write observing `now > started_at + duration_seconds` (US4-AC6). Answers arriving after the deadline are rejected server-side (FR-020).
Score Report = finalized `exam_sessions` row + per-question breakdown joined from `session_answers` (no separate table).

### session_answers  *(US3/US4; FR-017, FR-018, FR-020)*
| Column | Type | Constraints |
|---|---|---|
| id | uuid | PK |
| session_kind | text | NOT NULL, CHECK in ('trainer','exam') |
| session_id | uuid | NOT NULL — FK enforced in app layer against the matching table |
| question_id | uuid | FK → bank_questions, NOT NULL |
| given_answer | text | NOT NULL |
| is_correct | boolean | NOT NULL |
| answered_at | timestamptz | NOT NULL default now() — exam-deadline validation input |

UNIQUE (session_kind, session_id, question_id) — one answer per question per session.

### assistant_threads / assistant_messages  *(US1; FR-003–FR-007, FR-030)*
`assistant_threads`: `id, document_id FK NOT NULL CASCADE` — one thread per document (single-document scope).
`assistant_messages`:
| Column | Type | Constraints |
|---|---|---|
| id | uuid | PK |
| thread_id | uuid | FK → assistant_threads, NOT NULL, CASCADE |
| role | text | NOT NULL, CHECK in ('user','assistant') |
| content | text | NOT NULL |
| status | text | NOT NULL, CHECK in ('ok','pending_retry') — 'pending_retry' preserves an unanswered user question (FR-030, US1-AC8) |
| engine | text | NULL, CHECK in ('gemini','local') — assistant rows only (FR-025 analog for US1-AC7 disclosure) |
| citations | jsonb | NULL — array of `{page: int, chunk_id: uuid}`; every grounded answer has ≥ 1 (FR-005); empty + declined answers use the FR-007 explicit-refusal content |

### feynman_submissions  *(US5; FR-022, FR-030)*
| Column | Type | Constraints |
|---|---|---|
| id | uuid | PK |
| topic_id | uuid | FK → topics, NOT NULL |
| explanation | text | NOT NULL, non-empty, ≤ 20,000 characters (edge case: empty or oversize submission rejected at validation — bound fixed 2026-07-05 so it's testable, see contracts/api.md) |
| status | text | NOT NULL, CHECK in ('submitted','pending_retry','evaluated'), default 'submitted' |

State transitions: `submitted` (initial — student sent it, no evaluation attempt has
concluded yet) → `evaluated` (either engine produced a persisted `ai_evaluations`
row) · `submitted → pending_retry` (both engines failed; text preserved for retry —
FR-030, US5-AC5, set via `PATCH …/retry-state`) · `pending_retry → evaluated`
(a later retry succeeded). No other transitions; `evaluated` is terminal.

### ai_evaluations  *(US5; FR-023, FR-024, FR-025)*
| Column | Type | Constraints |
|---|---|---|
| id | uuid | PK |
| submission_id | uuid | FK → feynman_submissions, NOT NULL, CASCADE |
| engine | text | NOT NULL, CHECK in ('gemini','local') — disclosure (FR-025, US5-AC4) |
| correct_points / missing_points / wrong_points | jsonb | NOT NULL — string arrays (FR-023 structure) |
| review_suggestions | jsonb | NOT NULL — string array |
| citations | jsonb | NULL — `{document_id, page}` refs when topic has Library docs (FR-024) |

## Relationship summary

```
courses 1─* topics 1─* documents 1─* document_chunks
                    1─* flashcards        (SM-2 state embedded)
                    1─* bank_questions    (SM-2 state embedded)
                    1─* feynman_submissions 1─* ai_evaluations
documents 1─1 assistant_threads 1─* assistant_messages
trainer_sessions/exam_sessions ──* session_answers ──1 bank_questions
review_logs → (item_type, item_id) soft-refs flashcards|bank_questions
```

## Derived queries (no tables)

- **Due queue** (FR-014, SC-003, SC-007): UNION of flashcards and bank_questions where `next_review_at ≤ today`, grouped by course/topic/item-type; "due within the next 7 days" is a **rolling 7-day window** (`next_review_at ≤ today + 7`), NOT the calendar week (clarified 2026-07-05 — avoids a Sunday-boundary discrepancy between spec wording and implementation). Priority ordering: most-overdue first. `today` is always caller-supplied (`GET /api/review/due?...&today=YYYY-MM-DD`) — there is no reliable server-side notion of "the student's local day," and this keeps the query deterministic/testable, mirroring the SM-2 engine's injected-`today` contract (contracts/engine.md).
- **Score report breakdown** (FR-021): `session_answers` joined to `bank_questions`/`topics` for the failed-per-topic rollup.
