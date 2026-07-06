---

description: "Task list for Personal Study App Core Features"
---

# Tasks: Personal Study App Core Features

**Input**: Design documents from `/specs/001-study-app-mvp/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/api.md, contracts/engine.md, quickstart.md

**Tests**: MANDATORY (constitution Principle I, NON-NEGOTIABLE). Every implementation task is preceded by a task that writes its tests and observes them FAIL. Test titles embed AC/FR ids (e.g. `"US2-AC2: correct in review never decreases interval"`) — this is the Principle IV traceability mechanism, consolidated in T078.

**Organization**: Tasks are grouped by user story (P1–P5) so each story is independently implementable and testable.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies on incomplete tasks)
- **[Story]**: User story label (US1–US5); Setup/Foundational/Polish tasks have none
- Exact file paths included in every task

## Path Conventions

Single Next.js 16 project at repo root: `src/app` (routes + API), `src/lib` (pure logic + infrastructure), `tests/{unit,property,integration,a11y}`, `e2e/` (Playwright). See plan.md → Project Structure.

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Project scaffolding and the five-gate test toolchain

- [X] T001 Scaffold Next.js 16 app at repo root (`pnpm create next-app`: TypeScript strict, App Router, Tailwind CSS 4, `src/` dir); verify `package.json` pins `"next": "^16.2.10"` (plan.md — the access gate depends on Next 16's `proxy.ts` convention)
- [X] T002 Install runtime deps: `drizzle-orm @neondatabase/serverless @google/genai @huggingface/transformers pdfjs-dist @vercel/blob jose zod` + dev `drizzle-kit`
- [X] T003 [P] Configure Vitest in `vitest.config.ts`: projects for unit/property/integration/a11y; jsdom for components; PGlite with pgvector as hermetic Postgres for integration tests; MSW server in `tests/setup.ts`; install `fast-check`, `msw`, `vitest-axe`, `@electric-sql/pglite`. **Risk note resolved**: verified empirically against `@electric-sql/pglite@0.5.4` that `CREATE INDEX ... USING hnsw` works (pgvector ships as the separate `@electric-sql/pglite-pgvector` package in this version, not a `contrib/` entry) — no exact-scan fallback needed; see `tests/integration/_setup-pglite.test.ts`
- [X] T004 [P] Configure StrykerJS in `stryker.config.json`: `@stryker-mutator/vitest-runner`; `mutate` limited to `src/lib/engine/**`, `src/lib/scoring/**`, `src/lib/ai/feynman-eval.ts`; `thresholds.break: 80` (Principle II). Required explicit `"plugins": ["@stryker-mutator/vitest-runner"]` (autoloading didn't resolve it under pnpm). Dry-run confirmed reachable; will report real scores once T042+ adds mutable code
- [X] T005 [P] Configure Playwright + `@axe-core/playwright` in `playwright.config.ts` + `e2e/` (WCAG 2.1 A/AA tags)
- [X] T006 [P] Configure ESLint (incl. `eslint-plugin-jsx-a11y`) + Prettier; add pnpm scripts: `test`, `test:property`, `test:mutation`, `test:a11y`, `test:e2e`, `db:migrate`, `db:seed`, `db:timeshift`
- [X] T007 [P] Create `.env.local.example` documenting `DATABASE_URL`, `APP_PASSCODE`, `SESSION_SECRET`, `GEMINI_API_KEY`, `BLOB_READ_WRITE_TOKEN` (quickstart.md)

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: DB core, access gate, logger, courses/topics, app shell — no user story can start before this completes

**⚠️ CRITICAL**: TDD order inside each pair: the test task MUST fail before its implementation task starts.

- [X] T008 Drizzle client `src/lib/db/index.ts` + `drizzle.config.ts` + migration 0001 (`CREATE EXTENSION IF NOT EXISTS vector`) — generated as `drizzle/0000_create_vector_extension.sql` via `drizzle-kit generate --custom` (drizzle-kit's own numbering is 0-indexed); `tests/helpers/pglite.ts` extended with `createTestDb()` (Drizzle + migrations applied against PGlite)
- [X] T009 `courses` + `topics` schema in `src/lib/db/schema.ts` + migration (UNIQUE `code`; UNIQUE `(course_id, name)`; cascades per data-model.md) — `drizzle/0001_courses_topics.sql`; verified `gen_random_uuid()` default, both UNIQUE constraints, and `ON DELETE CASCADE` all work against PGlite
- [X] T010 [P] Write failing unit test `tests/unit/logging.test.ts` (event shape: boundary, engine?, failure_class?, expected_degradation, latency_ms), then implement structured JSON logger `src/lib/logging.ts` (Principle VIII)
- [X] T011 Write failing integration tests `tests/integration/proxy.test.ts`: uncookied `GET /` → redirect `/unlock`; wrong passcode → 401; correct passcode → signed cookie + access; tampered cookie → redirect [FR-026]
- [X] T012 Implement gate → T011 green: `src/proxy.ts` (named export `proxy` — `middleware.ts` is prohibited in this project since middleware is deprecated/renamed to proxy in Next 16, research.md R6), `src/app/api/unlock/route.ts`, `src/lib/auth.ts` (double-HMAC timing-safe compare + jose HS256 cookie, 30-day expiry)
- [X] T013 Write failing integration tests `tests/integration/api/courses.test.ts`: GET/POST `/api/courses` (409 duplicate code), POST/PATCH/DELETE `/api/topics` [FR-009]
- [X] T014 Implement `src/app/api/courses/route.ts` + `src/app/api/topics/route.ts` + `src/app/api/topics/[id]/route.ts` with zod validation → T013 green. `GET /api/courses` intentionally omits the FR-014 due-count rollup for now (flashcards/bank_questions don't exist until Phase 4) — deferred to T047
- [X] T015 Write failing a11y component test `tests/a11y/shell.test.tsx` (vitest-axe, focus management), then implement app shell: `src/app/layout.tsx` (mobile-first, `lang="es"`), `src/components/BottomTabs.tsx`, `src/app/unlock/page.tsx` [FR-028]

**Checkpoint**: Gate + DB + courses/topics ready — user stories can begin

---

## Phase 3: User Story 1 - Document Library with a page-citing assistant (Priority: P1) 🎯 MVP

**Goal**: Upload a PDF to a topic, read it page-by-page, ask an overlay assistant that answers only from the document with exact page citations, tap-to-jump, refusal when unanswerable, Gemini→local→FR-030 fallback chain.

**Independent Test**: quickstart.md scenario 1 — upload → ask answerable + unanswerable questions → citation jump → forced-fallback drill → double-failure drill → SC-002 fixture set (≥20 questions) achieves 100% citation accuracy / 100% refusal.

### Tests & Implementation for User Story 1 (MANDATORY per constitution Principle I) ⚠️

- [X] T016 [US1] `documents` + `document_chunks` schema + migration with HNSW cosine index on `embedding vector(384)`; DB CHECK `page_number ≥ 1` only — upper bound is app-layer (data-model.md)
- [X] T017 [P] [US1] Write failing unit tests `tests/unit/rag/chunking.test.ts`: ~400-token page-aware chunks, never cross pages, sequential `chunk_index`, `page_number` preserved [US1-AC1]
- [X] T018 [US1] Implement `src/lib/rag/chunking.ts` → T017 green
- [X] T019 [P] [US1] Write failing unit tests `tests/unit/rag/embed.test.ts`: wrapper contract — 384-dim output, batching, injected pipeline stub, single model id (`multilingual-e5-small`) shared by server and client entries (research.md R3)
- [X] T020 [US1] Implement `src/lib/rag/embed.ts` → T019 green
- [X] T021 [US1] Write failing integration tests `tests/integration/api/documents.test.ts`: POST → 202 `processing` → `ready` with chunks embedded; `page_number > page_count` → 422 (app-layer bound); corrupt/non-PDF → status `failed` + explicit error (spec edge case); GET document; GET `/chunks` returns `{id, pageNumber, content, embedding}` [FR-001, US1-AC1]
- [X] T022 [US1] Implement `src/app/api/documents/route.ts`, `[id]/route.ts`, `[id]/chunks/route.ts` + Vercel Blob client-upload token route `src/app/api/blob/route.ts` → T021 green. `GET /api/courses`'s FR-014 due-count rollup intentionally deferred to T047 (no flashcards/bank_questions tables yet)
- [X] T023 [P] [US1] Write failing unit tests `tests/unit/ai/classify.test.ts` for `classifyGeminiError`: abort → `timeout`; 429/RESOURCE_EXHAUSTED → `quota`; fetch TypeError → `network`; malformed body → `invalid_response` [Principle V]
- [X] T024 [US1] Implement `src/lib/ai/types.ts` (FailureClass taxonomy, AnswerEngine interface) + `src/lib/ai/gemini.ts` (10 s AbortController timeout, classification, structured logs) → T023 green. Gemini timeout is overridable via `GEMINI_TIMEOUT_MS` env var (production always 10s) so integration tests can exercise the real AbortController path fast
- [X] T025 [P] [US1] Write failing unit tests `tests/unit/ai/fallback.test.ts` for the `nextChainState` reducer + `askWithFallback`: any Gemini failure class → local attempted; any local failure class (`unsupported|oom|not_cached|inference_error`) → `{ok:false, state:'unavailable'}`; engine always disclosed; exactly one log event per transition with correct `expected_degradation` [FR-008, FR-030, US1-AC7, US1-AC8]
- [X] T026 [US1] Implement `src/lib/ai/fallback.ts` → T025 green
- [X] T027 [P] [US1] Write failing unit tests `tests/unit/ai/local.test.ts` with injected stubs: no `navigator.gpu` → `unsupported`; init OOM → `oom`; offline + weights not in Cache Storage → `not_cached`; crash → `inference_error`; two-profile model constant selected by `deviceMemory` (research.md R2, R4)
- [X] T028 [US1] Implement `src/lib/ai/local.ts` (transformers.js WebGPU, load-progress callback, Cache Storage weights) → T027 green
- [X] T029 [US1] Write failing integration tests `tests/integration/api/assistant.test.ts` (MSW): `POST /api/assistant/ask` success → answer + `citations[{page, chunkId}]` + engine `gemini` [US1-AC4]; unanswerable → explicit FR-007 refusal, zero invented citations [US1-AC6]; simulated timeout/quota/network → `502 {failureClass}` [US1-AC7]; `POST /api/assistant/retrieve` → top-k chunks with `pageNumber`, scoped to the single document [FR-004]. MSW intercepts the real `generativelanguage.googleapis.com` endpoint (verified request/response shapes against the bundled `@google/genai` SDK source), including a real (short-lived) AbortController timeout via `delay('infinite')`
- [X] T030 [P] [US1] **(SC-002 coverage)** Write a failing fixture-based test `tests/integration/api/assistant-citation-set.test.ts` against a committed fixture `tests/fixtures/us1-citation-set.json`: ≥20 representative questions over the seeded PDF, split between answerable (with the expected correct page) and deliberately unanswerable. Assert **100%** of answerable questions return a citation matching the expected page, and **100%** of unanswerable questions receive the explicit FR-007 refusal (zero fabricated answers). This is the executable form of SC-002 and MUST fail before T031 exists
- [X] T031 [US1] Implement `src/lib/rag/retrieve.ts` (pgvector cosine top-k=6, document-scoped) + `src/app/api/assistant/ask/route.ts` (grounded prompt: answer only from chunks, cite `[p. N]`, refuse otherwise) + `src/app/api/assistant/retrieve/route.ts` → T029 AND T030 green
- [X] T032 [P] [US1] Write failing unit tests `tests/unit/rag/local-retrieve.test.ts`: cosine top-k ordering over cached chunks; insufficient-cache detection returns a retrieval-failure signal (research.md R1-B)
- [X] T033 [US1] Implement `src/lib/rag/local-retrieve.ts` + IndexedDB cache warm on document open (GET `/chunks` → IndexedDB) → T032 green
- [X] T034 [US1] Write failing integration tests `tests/integration/api/messages.test.ts`: one thread per document; POST/GET messages; on double failure the user question persists with status `pending_retry` and is retryable [FR-030, US1-AC8]
- [X] T035 [US1] Implement `assistant_threads`/`assistant_messages` schema + migration + `src/app/api/documents/[id]/messages/route.ts` → T034 green
- [X] T036 [US1] Write failing a11y/component tests `tests/a11y/viewer.test.tsx`, then implement Library UI: `src/app/library/*` (upload flow, Subir/Visor/Asistente bottom-tabs) + `src/components/PdfViewer.tsx` (pdfjs-dist page render, page nav, zoom); include an empty-state view for a topic with no documents yet (spec Edge Cases) [FR-002, US1-AC2, FR-028]
- [X] T037 [US1] Write failing a11y/component tests `tests/a11y/assistant.test.tsx`, then implement assistant overlay: opens over viewer without route change [US1-AC3]; citation chips tap → viewer jumps to page [US1-AC5, FR-006]; engine badge [US1-AC7]; FR-030 unavailable state with preserved question + retry [US1-AC8, FR-028]
- [X] T038 [US1] Playwright `e2e/us1-library.spec.ts`: full journey per quickstart scenario 1, incl. forced-fallback drill (Gemini route blocked), double-failure drill (Gemini blocked + WebGPU disabled), **and an acceptance run of the SC-002 fixture set from T030** asserting the same 100%/100% thresholds hold end-to-end through the real UI, not just the API

**Checkpoint**: US1 fully functional and independently testable — MVP deliverable

---

## Phase 4: User Story 2 - Topic management and spaced-repetition engine (Priority: P2)

**Goal**: Courses/topics management, flashcards, the pure SM-2 engine over Flashcards AND Bank Questions (incl. the FR-018 asymmetry), due queue, review flow, home dashboard.

**Independent Test**: quickstart.md scenario 2 — create card → due today → outcomes over simulated days → counts and ease/interval invariants; `review_logs.schedule_changed` asymmetry check; 30-day zero-drift simulation.

### Tests & Implementation for User Story 2 (MANDATORY per constitution Principle I) ⚠️

- [X] T039 [US2] `flashcards` + `bank_questions` schema with SM-2 column group (defaults `next_review_at = CURRENT_DATE`, `interval_days 0`, `ease_factor 2.5`, CHECK `≥ 1.3`) + `review_logs` (with `schedule_changed`) + migration (data-model.md)
- [X] T040 [P] [US2] Write failing fast-check property tests `tests/property/engine/sm2.property.test.ts` for invariants E1–E8 (contracts/engine.md §1), AC ids in titles: "US2-AC2: correct in review never decreases interval", "US2-AC3/AC6: incorrect resets to 1 day, never past", "US2-AC4: ease ≥ 1.3 always", "US2-AC7: trainer/exam-correct is a no-op", "US2-AC1/FR-011: new item due on creation day", determinism [Principle III]. **(SC-003 coverage)** ALSO add an explicit model-based 30-day simulation property: generate a set of ≥5 spaced-repetition items with independent randomly-generated outcome sequences (fast-check arbitraries over `Outcome`/`ReviewContext`), step `today` from day 1 to day 30, and at **every** simulated day assert the due-queue (`isDue`) equals **exactly** the set of items whose `nextReviewAt ≤ today` — zero drift, no false positives/negatives, across the whole run
- [X] T041 [P] [US2] Write failing example-based unit tests `tests/unit/engine/sm2.test.ts`: canonical SM-2 sequences (1d → 6d → round(prev×EF)), hard behavior (E6), `isDue` predicate (SC-003)
- [X] T042 [US2] Implement `src/lib/engine/sm2.ts` (pure, `today` injected — never `Date.now()` inside) → T040 + T041 green
- [X] T043 [US2] Run Stryker scoped to `src/lib/engine/`; add mutant-killing tests until mutation score ≥ 80% (Principle II gate — recorded score: 96.20%)
- [X] T044 [P] [US2] Write failing integration tests `tests/integration/api/flashcards.test.ts`: flashcard CRUD; new card due same day [FR-010, FR-011, US2-AC1]
- [X] T045 [US2] Implement `src/app/api/flashcards/route.ts` + `[id]/route.ts` → T044 green
- [X] T046 [US2] Write failing integration tests `tests/integration/api/review.test.ts`: `POST /api/review/answer` (body incl. REQUIRED `today`) across outcomes × contexts — `review_logs.schedule_changed = false` for trainer/exam-correct [US2-AC7], override on incorrect in any context [US2-AC6]; `GET /api/review/due` (REQUIRED `today` query param) — union of both item types, `horizon=today` vs `horizon=week` as a **rolling 7-day window** (`next_review_at ≤ today+7`, NOT calendar week — clarified 2026-07-05), counts by type/topic/course, most-overdue first [FR-013, FR-014, FR-018, US2-AC5, SC-003]
- [X] T047 [US2] Implement `src/app/api/review/answer/route.ts` + `src/app/api/review/due/route.ts` (both require and thread through `today`, passed verbatim to `sm2Next`/the due-queue query — deterministic, no server clock read) + due-queue queries in `src/lib/db/queries.ts` → T046 green
- [X] T048 [US2] Write failing a11y/component tests `tests/a11y/review.test.tsx`, then implement: course/topic management UI `src/app/courses/*` [FR-009], review flow `src/app/review/*` (card reveal, correct/incorrect/hard), home dashboard due-today across all courses `src/app/page.tsx` [US2-AC5, SC-007, FR-028]; include empty-state views for a topic/course with no flashcards yet and for a dashboard with nothing due (spec Edge Cases)
- [X] T049 [US2] Playwright `e2e/us2-review.spec.ts`: quickstart scenario 2 incl. `db:timeshift` day simulation, **plus an explicit multi-day (≥10 simulated days), multi-item due-queue check** mirroring T040's property test at the UI/API level — confirms no drift is introduced above the pure-engine layer (SC-003)

**Checkpoint**: US1 and US2 independently functional

---

## Phase 5: User Story 3 - Entrenador: untimed practice (Priority: P3)

**Goal**: Bank-question authoring, untimed trainer sessions with feedback-before-advance, failed answers feed the SM-2 override; correct answers leave schedules untouched.

**Independent Test**: quickstart.md scenario 3 — session on seeded topic, no timer, per-answer feedback, failed question lands in due queue.

### Tests & Implementation for User Story 3 (MANDATORY per constitution Principle I) ⚠️

- [X] T050 [P] [US3] Write failing integration tests `tests/integration/api/bank-questions.test.ts`: CRUD with prompt/correctAnswer/explanation [FR-031, US3-AC1]
- [X] T051 [US3] Implement `src/app/api/bank-questions/route.ts` + `[id]/route.ts` → T050 green
- [X] T052 [US3] Write failing integration tests `tests/integration/api/trainer.test.ts`: POST sessions → frozen `question_ids` draw, 422 on empty bank (spec edge case) [FR-015, FR-016, US3-AC2]; GET resume at `current_index` [FR-029]; POST answers → `{isCorrect, explanation, review.scheduleChanged}` — incorrect → SM-2 override, correct → no-op [FR-017, FR-018, US3-AC4, US3-AC5]
- [X] T053 [US3] Implement `trainer_sessions` + `session_answers` schema + migration + `src/app/api/trainer/sessions/*` routes + `src/lib/session/trainer.ts` → T052 green
- [X] T054 [US3] Write failing a11y/component tests `tests/a11y/trainer.test.tsx`, then implement Trainer UI `src/app/trainer/*`: no timer [US3-AC3], feedback + explanation before advancing [US3-AC4], bank-question authoring screens [FR-031, FR-028]; include an empty-state view for a topic with no bank questions yet, distinct from the API's 422 (spec Edge Cases)
- [X] T055 [US3] Playwright `e2e/us3-trainer.spec.ts`: quickstart scenario 3

**Checkpoint**: US1–US3 independently functional

---

## Phase 6: User Story 4 - Timed exam simulator (Priority: P4)

**Goal**: Configurable timed exams with a server-authoritative clock, auto-stop + grading at zero, score report with failed breakdown, SM-2 override for failures, real-elapsed-time resume.

**Independent Test**: quickstart.md scenario 4 — short exam runs to timeout, auto-grades ≤ 5 s, close/reopen preserves real elapsed time, reopen-after-expiry shows graded report.

### Tests & Implementation for User Story 4 (MANDATORY per constitution Principle I) ⚠️

- [X] T056 [P] [US4] Write failing property + unit tests `tests/property/scoring/timer.property.test.ts` + `tests/unit/scoring/timer.test.ts`: `remainingMs ≥ 0` (clamped), monotone non-increasing in `now`, `isExpired ⇔ remainingMs = 0`, resume equals real elapsed time [FR-020, FR-029, US4-AC5, US4-AC6, Principle III]
- [X] T057 [US4] Implement `src/lib/scoring/timer.ts` → T056 green
- [X] T058 [P] [US4] Write failing property + unit tests `tests/property/scoring/grade.property.test.ts` + `tests/unit/scoring/grade.test.ts`: `0 ≤ correct ≤ answered ≤ total`; unanswered counted wrong; `failed` = wrong ∪ unanswered; `scorePct` formula [FR-020, FR-021, US4-AC2, US4-AC3]
- [X] T059 [US4] Implement `src/lib/scoring/grade.ts` → T058 green
- [X] T060 [US4] Run Stryker scoped to `src/lib/scoring/`; kill mutants to ≥ 80% (Principle II gate — recorded score: 94.74%)
- [X] T061 [US4] Write failing integration tests `tests/integration/api/exam.test.ts`: create → server `started_at`, 422 empty bank [US4-AC1]; GET past deadline auto-finalizes [US4-AC6]; answers after expiry → 409 rejected [FR-020]; finalize idempotent → report + SM-2 override for failed questions [FR-021, US4-AC3, US4-AC4]; GET returns server-computed `remainingMs` for resume [US4-AC5, FR-029]
- [X] T062 [US4] Implement `exam_sessions` schema + migration + `src/app/api/exam/sessions/*` routes + `src/lib/session/exam.ts` → T061 green
- [X] T063 [US4] Write failing a11y/component tests `tests/a11y/exam.test.tsx`, then implement Exam UI `src/app/exam/*`: duration config, countdown rendered from server values (cosmetic only), report screen with score + failed breakdown, resume/expired states [US4-AC2, US4-AC3, US4-AC5, US4-AC6, FR-028]
- [X] T064 [US4] Playwright `e2e/us4-exam.spec.ts`: quickstart scenario 4 (expiry, close/reopen); **assert the score report renders within 5 seconds of the exam ending** (SC-005 — explicit timing check, not just presence of the report)

**Checkpoint**: US1–US4 independently functional

---

## Phase 7: User Story 5 - Feynman mode with AI evaluation (Priority: P5)

**Goal**: Free-text explanation → structured correct/missing/wrong/review-suggestions feedback, grounded in the topic's Library documents with page citations, engine disclosure, full fallback chain terminating in FR-030 with the explanation preserved.

**Independent Test**: quickstart.md scenario 5 — normal evaluation with citation, forced-local drill, double-failure drill with preserved text.

### Tests & Implementation for User Story 5 (MANDATORY per constitution Principle I) ⚠️

- [X] T065 [US5] `feynman_submissions` (status `submitted|pending_retry|evaluated`, default `submitted`, transitions per data-model.md; `explanation` non-empty, **≤ 20,000 characters** — concrete oversize bound, contracts/api.md) + `ai_evaluations` schema + migration
- [X] T066 [P] [US5] Write failing unit tests `tests/unit/ai/feynman-eval.test.ts`: `normalizeEvaluation` never throws; malformed → `{error:'invalid_response'}` (feeds fallback chain); invalid citation pages dropped, never invented; identical output shape for Gemini and local raw input [FR-023, FR-024, US5-AC1, US5-AC2]
- [X] T067 [US5] Implement `src/lib/ai/feynman-eval.ts` → T066 green
- [X] T068 [US5] Run Stryker scoped to `src/lib/ai/feynman-eval.ts`; ≥ 80% (Principle II gate — recorded score: 87.16%)
- [X] T069 [US5] Write failing integration tests `tests/integration/api/feynman.test.ts` (MSW): POST submissions → status `submitted`; **422 on empty/whitespace-only explanation AND 422 on explanation > 20,000 characters** (concrete oversize bound test, replacing the previously-undefined edge case) [spec edge case]; `POST …/evaluate` → Gemini structured output + topic-document citations, sets `evaluated` [US5-AC1, US5-AC2]; simulated timeout/quota/network → `502 {failureClass}` [US5-AC3]; `POST /api/feynman/retrieve` → multi-document chunks `{chunkId, documentId, pageNumber, content}`, `[]` when topic has no ready documents; `POST …/evaluations` (engine `local`) → `evaluated`; `PATCH …/retry-state` idempotent, 409 if already `evaluated` [FR-030, US5-AC5]
- [X] T070 [US5] Implement `src/app/api/feynman/*` routes (submissions, evaluate, retrieve, evaluations, retry-state) → T069 green
- [X] T071 [US5] Write failing unit tests `tests/unit/ai/feynman-fallback.test.ts` for the client Scenario-B grounding decision (contracts/api.md): topic has ready docs + cache absent/insufficient → FR-030, NEVER ungrounded; no ready docs → ungrounded allowed (citations omitted); local engine failure → retry-state queued for reconnection [US5-AC5]
- [X] T072 [US5] Implement client Feynman fallback wiring `src/app/feynman/fallback-client.ts` (askWithFallback + grounding rules + retry-state queue) → T071 green
- [X] T073 [US5] Write failing a11y/component tests `tests/a11y/feynman.test.tsx`, then implement Feynman UI `src/app/feynman/*`: explanation editor (client-side 20,000-char guard mirroring the server bound), structured feedback display (correct/missing/wrong/suggestions + citations), engine badge [FR-025, US5-AC4], unavailable state with preserved explanation [US5-AC5, FR-028]
- [X] T074 [US5] Playwright `e2e/us5-feynman.spec.ts`: quickstart scenario 5 (normal, forced local, double failure preserved)

**Checkpoint**: All five user stories independently functional

---

## Phase 8: Polish & Cross-Cutting Concerns

- [ ] T075 [P] Seed + dev scripts: `scripts/seed.ts` (course IS-481, topic, sample cards/questions, PDF fixture, and the `tests/fixtures/us1-citation-set.json` source PDF used by T030/T038) and `scripts/timeshift.ts` (`db:timeshift`, dev-only) — mechanism: shifts the `next_review_at` (and, where relevant, `started_at`) columns backward by N days directly in the DB; no system-clock faking is needed since the SM-2 engine and timer math take `today`/`now` as injected parameters (contracts/engine.md)
- [ ] T076 [P] Playwright a11y sweep `e2e/a11y-sweep.spec.ts`: every screen in seeded state, WCAG 2.1 A/AA, zero critical violations [SC-008, FR-028]
- [ ] T077 Full Stryker run across all three scopes, confirm ≥ 80% each; record scores in `docs/quality-report.md` (Principle II evidence)
- [ ] T078 [P] Traceability table `docs/traceability.md`: every AC (US1-AC1..8, US2-AC1..7, US3-AC1..5, US4-AC1..6, US5-AC1..5), FR-001..FR-031, SC-001..SC-008 → test `file::name` (Principle IV). Explicitly include: SC-002 → T030/T038, SC-003 → T040/T049, SC-005 → T064, the `today`-param contract → T046/T047, the Feynman 20,000-char bound → T065/T069
- [ ] T079 Manual a11y spot-checks on Exam and Feynman screens (constitution Principle VI); record findings + fixes in `docs/quality-report.md`
- [ ] T080 Observability audit: every I/O boundary (AI calls, DB writes, timer finalization) emits structured events; `expected_degradation` correctly separates fallback-by-design from defects; add any missing [Principle VIII]
- [ ] T081 [P] `README.md`: setup, env vars, test commands, architecture summary (academic deliverable, constitution §Academic Deliverables)
- [ ] T082 Run quickstart.md validation scenarios 1–5 end-to-end; fix anything that breaks
- [ ] T083 Vercel deploy: project config + env vars; post-deploy smoke — passcode gate rejects/admits, data visible from a second device [FR-027]
- [ ] T084 Run `/speckit-analyze` and resolve any spec/plan/tasks drift (constitution §Governance compliance review)

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)** → nothing
- **Foundational (Phase 2)** → Setup. BLOCKS all user stories.
- **User Stories (Phases 3–7)** → Foundational. Priority order P1→P5 is the recommended solo sequence.
- **Polish (Phase 8)** → all desired user stories complete.

### Cross-Story Dependencies (module reuse, not test coupling)

- **US3 → US2**: trainer answers call the SM-2 engine + `/api/review/answer` (T042, T047).
- **US4 → US3**: exams reuse `bank_questions` CRUD (T051) and `session_answers` (T053).
- **US5 → US1**: Feynman grounding reuses `src/lib/rag/*` (T018/T020/T031/T033) and `src/lib/ai/{gemini,local,fallback}` (T024/T026/T028). If US5 were built before US1, those lib tasks move with it.
- Each story remains independently *testable* per its quickstart scenario once its dependencies' phases are done.

### Within Each Story

- Test task MUST fail before its paired implementation task (Principle I — no exceptions).
- Schema → pure logic → API routes → UI → e2e.
- Stryker gate tasks (T043, T060, T068) block their story's checkpoint.

### Parallel Opportunities

- Phase 1: T003–T007 in parallel after T001–T002.
- US1: T017, T019, T023, T025, T027, T030, T032 (test authoring, different files) in parallel once T016 exists.
- US2: T040, T041, T044 in parallel after T039.
- US4: T056 and T058 in parallel.
- Polish: T075, T076, T078, T081 in parallel.

## Parallel Example: User Story 1

```bash
# After T016, author these failing test suites together:
Task: "T017 unit tests for page-aware chunking in tests/unit/rag/chunking.test.ts"
Task: "T019 unit tests for embed wrapper in tests/unit/rag/embed.test.ts"
Task: "T023 unit tests for classifyGeminiError in tests/unit/ai/classify.test.ts"
Task: "T025 unit tests for fallback chain in tests/unit/ai/fallback.test.ts"
Task: "T027 unit tests for local engine failure classes in tests/unit/ai/local.test.ts"
Task: "T030 SC-002 citation-set fixture test in tests/integration/api/assistant-citation-set.test.ts"
```

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Phase 1 (Setup) → Phase 2 (Foundational) → Phase 3 (US1).
2. **STOP and VALIDATE**: quickstart scenario 1, including both fallback drills and the SC-002 fixture-set pass rate.
3. Deploy to Vercel — a usable "chat with your PDF, cited by page" app is the MVP.

### Incremental Delivery

Each subsequent phase (US2 → US3 → US4 → US5) ends at a checkpoint validated by its quickstart scenario and its e2e spec; deploy after any checkpoint. The mutation gates (T043, T060, T068) and the traceability table (T078) are non-negotiable before calling the feature done.

## Notes

- [P] = different files, no incomplete dependencies.
- Every test task's titles carry AC/FR ids — T078 consolidates them; a task may not be checked off if its ACs lack a linked test (Principle IV).
- Pure modules take `today`/`now` as parameters (contracts/engine.md) — never `Date.now()` inside. The `today`/`now` values themselves are always caller-supplied at the API boundary (T046/T047, contracts/api.md) — there is no reliance on the server's own clock/timezone for "the student's local day."
- "Due within the next 7 days" is a rolling window (`≤ today+7`), never the calendar week — see spec.md FR-014/US2-AC5, data-model.md, contracts/api.md (clarified 2026-07-05).
- Feynman explanations are capped at 20,000 characters, enforced both server-side (T069) and as a client-side guard (T073).
- Commit after each task or red-green pair; keep the failing-test commit separate from the green commit where practical (visible TDD evidence, constitution §Development Workflow).
