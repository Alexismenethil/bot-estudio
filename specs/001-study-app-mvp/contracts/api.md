# API Contracts (Next.js route handlers)

**Feature**: `001-study-app-mvp` | **Date**: 2026-07-05

All routes live under `src/app/api/**` and require the signed passcode cookie
(middleware) except `POST /api/unlock`. Errors use `{ error: { code, message } }`
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
| `POST /api/feynman/submissions` | `{ topicId, explanation }` | `Submission` · 422 empty/oversize (edge case) |
| `POST /api/feynman/submissions/:id/evaluate` | — | `{ evaluation, engine:'gemini' } \| 502 { failureClass }` — server path retrieves topic-doc chunks (FR-024) + Gemini structured output; on 502 client runs local engine and persists via the route below (FR-008) |
| `POST /api/feynman/submissions/:id/evaluations` | `{ engine:'local', evaluation }` | `201` — persists client-side local result; submission `status` stays `pending_retry` only when both engines failed (FR-030, US5-AC5) |
| `GET /api/feynman/submissions/:id` | — | submission + evaluations with engine tags (FR-025) |

## Contract-level guarantees

- **Fallback choreography**: server routes return `502 { failureClass ∈ timeout|quota|network|invalid_response }` instead of generic errors so the client-side `askWithFallback()` chain (contracts/engine.md §5) can proceed to the local engine and, on double failure, set `pending_retry` state (FR-030). No route ever fabricates an answer.
- **Exam deadline**: every exam route recomputes expiry from `started_at + duration_seconds` on the server clock; the client countdown is cosmetic (FR-020, FR-029).
- **Traceability**: integration tests per route are named `<METHOD> <route> [FR-xxx/USn-ACm]` (Principle IV).
