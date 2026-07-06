# API Contracts (Next.js route handlers)

**Feature**: `001-study-app-mvp` | **Date**: 2026-07-05

All routes live under `src/app/api/**` and require the signed passcode cookie
(enforced by the `src/proxy.ts` gate — Next 16) except `POST /api/unlock`. Errors use `{ error: { code, message } }`
with appropriate HTTP status; all mutating routes validate bodies with zod schemas
shared with the client. Structured log event per request at the DB/AI boundaries
(Principle VIII).

## Auth

| Route | Req | Res | Notes |
|---|---|---|---|
| `POST /api/unlock` | `{ passcode }` | `204` + Set-Cookie / `401` | Double-HMAC timing-safe compare (R6); no lockout state (single user) |

## Courses & Topics (US2)

| Route | Req | Res |
|---|---|---|
| `GET /api/courses` | — | `Course[]` with due-count rollups (FR-014) |
| `POST /api/courses` | `{ code, name }` | `Course` · 409 on duplicate code |
| `POST /api/topics` | `{ courseId, name }` | `Topic` (FR-009) |
| `PATCH/DELETE /api/topics/:id` | partial | `Topic` / `204` |

## Library (US1)

| Route | Req | Res |
|---|---|---|
| `POST /api/documents` | `{ topicId, title, blobUrl, pages: { pageNumber, text }[] }` | `202 { id, status:'processing' }` — server chunks+embeds, then `ready`/`failed` (FR-001) |
| `GET /api/documents/:id` | — | `Document` incl. `status`, `blobUrl`, `pageCount` |
| `GET /api/documents/:id/chunks` | — | `{ chunks: { id, pageNumber, content, embedding }[] }` — client IndexedDB cache warm for offline retrieval (R1-B) |
| `POST /api/assistant/ask` | `{ documentId, question }` | `{ answer, citations:[{page,chunkId}], engine:'gemini' } \| 502 { failureClass }` — server path: pgvector retrieve + Gemini; on failure client drives local fallback (FR-004–FR-008) |
| `POST /api/assistant/retrieve` | `{ documentId, question }` | `{ chunks:[{ id, pageNumber, content }] }` — Scenario A: retrieval-only for client-side local generation (R1-A) |
| `GET /api/documents/:id/messages` · `POST …/messages` | `{ role, content, status, engine?, citations? }` | thread persistence incl. `pending_retry` questions (FR-030, US1-AC8) |

## Spaced repetition (US2)

| Route | Req | Res |
|---|---|---|
| `GET /api/review/due?scope=course:id\|topic:id&horizon=today\|week` | — | due items (union flashcards+bank questions), counts by type/topic/course (FR-014, SC-007) |
| `POST /api/review/answer` | `{ itemType, itemId, outcome, context }` | `{ state, scheduleChanged }` — sole write path into `sm2Next`; writes `review_logs`; used by review (context='review'), trainer/exam wiring uses context accordingly (FR-013, FR-018) |
| `POST/PATCH/DELETE /api/flashcards[..:id]` | front/back + topicId | CRUD (FR-010) |
| `POST/PATCH/DELETE /api/bank-questions[..:id]` | prompt/correctAnswer/explanation + topicId | CRUD (FR-031) |

## Trainer (US3)

| Route | Req | Res |
|---|---|---|
| `POST /api/trainer/sessions` | `{ scopeType, scopeId }` | `TrainerSession` with frozen `questionIds` (FR-015, FR-016) · 422 if bank empty (edge case) |
| `GET /api/trainer/sessions/:id` | — | session + `currentIndex` — resume point (FR-029) |
| `POST /api/trainer/sessions/:id/answers` | `{ questionId, givenAnswer }` | `{ isCorrect, explanation, review: { state, scheduleChanged } }` — feedback before advance (FR-017); incorrect ⇒ SM-2 override, correct ⇒ no-op (FR-018) |

## Exam (US4)

| Route | Req | Res |
|---|---|---|
| `POST /api/exam/sessions` | `{ scopeType, scopeId, durationSeconds }` | `ExamSession` with `startedAt` (server clock, R11) · 422 if bank empty |
| `GET /api/exam/sessions/:id` | — | session + server-computed `remainingMs`; auto-finalizes if expired (US4-AC6) |
| `POST /api/exam/sessions/:id/answers` | `{ questionId, givenAnswer }` | `201` · `409 expired` if past deadline — answer rejected, session finalized (FR-020) |
| `POST /api/exam/sessions/:id/finalize` | — | `GradedExam` report — idempotent; also invoked implicitly (FR-021, SC-005); failed questions get SM-2 override writes (FR-018, US4-AC4) |

## Feynman (US5)

| Route | Req | Res |
|---|---|---|
| `POST /api/feynman/submissions` | `{ topicId, explanation }` | `Submission` (status `submitted`) · 422 empty/oversize (edge case) |
| `POST /api/feynman/submissions/:id/evaluate` | — | `{ evaluation, engine:'gemini' } \| 502 { failureClass }` — server path retrieves topic-doc chunks (FR-024) + Gemini structured output; success sets status `evaluated`; on 502 client runs local engine and persists via the route below (FR-008) |
| `POST /api/feynman/retrieve` | `{ submissionId }` | `{ chunks: [{ chunkId, documentId, pageNumber, content }] }` — Scenario A mirror of `POST /api/assistant/retrieve` (R1-A): pgvector top-k across ALL documents of the submission's topic (hence `documentId` per chunk, unlike the single-document assistant), embedding the explanation text server-side with no Gemini involvement, so the client-side local engine can ground its evaluation and cite `{documentId, page}` (FR-024). `{ chunks: [] }` when the topic has no `ready` documents (evaluation proceeds ungrounded, citations omitted) |
| `POST /api/feynman/submissions/:id/evaluations` | `{ engine:'local', evaluation }` | `201` — persists client-side local result and sets submission status `evaluated` |
| `PATCH /api/feynman/submissions/:id/retry-state` | `{ status:'pending_retry', failureClasses: { gemini: FailureClass, local: FailureClass } }` | `200 Submission` — the executable FR-030 path for P5: client calls it after BOTH engines fail, marking the preserved explanation for later retry (US5-AC5). Idempotent; rejected with 409 if the submission is already `evaluated`. Failure classes land in the structured log (Principle VIII) |
| `GET /api/feynman/submissions/:id` | — | submission (incl. status) + evaluations with engine tags (FR-025) |

Feynman Scenario B (no backend connectivity): `POST /api/feynman/retrieve` is
unreachable by definition; the client reuses the same IndexedDB chunk cache as the
assistant (R1-B) for whichever of the topic's documents were previously opened,
embedding the explanation client-side. Grounding rules are strict:

- **Topic has `ready` documents but the cache is absent or insufficient** (no
  cached chunks for any of them, or client embedding unavailable): this is a
  **local retrieval failure** — the evaluation MUST NOT proceed ungrounded, because
  FR-024 requires document-referenced evaluation whenever the topic has documents.
  The client shows the FR-030 "temporarily unavailable" message, preserves the
  explanation, and queues the `retry-state` PATCH for when connectivity returns.
- **Topic has no `ready` documents at all**: ungrounded evaluation is valid
  (citations omitted) — this is the only case where the local engine may evaluate
  without retrieval, mirroring `{ chunks: [] }` on the Scenario A route.
- If the local engine itself fails in either case, same FR-030 path with queued
  `retry-state`. The submission text always survives: it lives server-side from
  `POST /api/feynman/submissions` or, if that call never succeeded, in client
  storage until it can be submitted (FR-030's "never lost" guarantee).

## Contract-level guarantees

- **Fallback choreography**: server routes return `502 { failureClass ∈ timeout|quota|network|invalid_response }` instead of generic errors so the client-side `askWithFallback()` chain (contracts/engine.md §5) can proceed to the local engine and, on double failure, set `pending_retry` state (FR-030). No route ever fabricates an answer.
- **Exam deadline**: every exam route recomputes expiry from `started_at + duration_seconds` on the server clock; the client countdown is cosmetic (FR-020, FR-029).
- **Traceability**: integration tests per route are named `<METHOD> <route> [FR-xxx/USn-ACm]` (Principle IV).
