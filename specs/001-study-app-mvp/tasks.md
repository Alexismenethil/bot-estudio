---

description: "Task list for Personal Study App Core Features"
---

# Tasks: Personal Study App Core Features

**Input**: Design documents from `/specs/001-study-app-mvp/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/api.md, contracts/engine.md, quickstart.md

**Tests**: MANDATORY (constitution Principle I, NON-NEGOTIABLE). Every implementation task is preceded by a task that writes its tests and observes them FAIL. Test titles embed AC/FR ids (e.g. `"US2-AC2: correct in review never decreases interval"`) — this is the Principle IV traceability mechanism, consolidated in T077.

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

- [ ] T001 Scaffold Next.js 16 app at repo root (`pnpm create next-app`: TypeScript strict, App Router, Tailwind CSS 4, `src/` dir); verify `package.json` pins `"next": "^16.2.10"` (plan.md — the access gate depends on Next 16's `proxy.ts` convention)
- [ ] T002 Install runtime deps: `drizzle-orm @neondatabase/serverless @google/genai @huggingface/transformers pdfjs-dist @vercel/blob jose zod` + dev `drizzle-kit`
- [ ] T003 [P] Configure Vitest in `vitest.config.ts`: projects for unit/property/integration/a11y; jsdom for components; PGlite with pgvector as hermetic Postgres for integration tests; MSW server in `tests/setup.ts`; install `fast-check`, `msw`, `vitest-axe`, `@electric-sql/pglite`
- [ ] T004 [P] Configure StrykerJS in `stryker.config.json`: `@stryker-mutator/vitest-runner`; `mutate` limited to `src/lib/engine/**`, `src/lib/scoring/**`, `src/lib/ai/feynman-eval.ts`; `thresholds.break: 80` (Principle II)
- [ ] T005 [P] Configure Playwright + `@axe-core/playwright` in `playwright.config.ts` + `e2e/` (WCAG 2.1 A/AA tags)
- [ ] T006 [P] Configure ESLint (incl. `eslint-plugin-jsx-a11y`) + Prettier; add pnpm scripts: `test`, `test:property`, `test:mutation`, `test:a11y`, `test:e2e`, `db:migrate`, `db:seed`, `db:timeshift`
- [ ] T007 [P] Create `.env.local.example` documenting `DATABASE_URL`, `APP_PASSCODE`, `SESSION_SECRET`, `GEMINI_API_KEY`, `BLOB_READ_WRITE_TOKEN` (quickstart.md)

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: DB core, access gate, logger, courses/topics, app shell — no user story can start before this completes

**⚠️ CRITICAL**: TDD order inside each pair: the test task MUST fail before its implementation task starts.

- [ ] T008 Drizzle client `src/lib/db/index.ts` + `drizzle.config.ts` + migration 0001 (`CREATE EXTENSION IF NOT EXISTS vector`)
- [ ] T009 `courses` + `topics` schema in `src/lib/db/schema.ts` + migration (UNIQUE `code`; UNIQUE `(course_id, name)`; cascades per data-model.md)
- [ ] T010 [P] Write failing unit test `tests/unit/logging.test.ts` (event shape: boundary, engine?, failure_class?, expected_degradation, latency_ms), then implement structured JSON logger `src/lib/logging.ts` (Principle VIII)
- [ ] T011 Write failing integration tests `tests/integration/proxy.test.ts`: uncookied `GET /` → redirect `/unlock`; wrong passcode → 401; correct passcode → signed cookie + access; tampered cookie → redirect [FR-026]
- [ ] T012 Implement gate → T011 green: `src/proxy.ts` (named export `proxy` — `middleware.ts` is prohibited, research.md R6), `src/app/api/unlock/route.ts`, `src/lib/auth.ts` (double-HMAC timing-safe compare + jose HS256 cookie, 30-day expiry)
- [ ] T013 Write failing integration tests `tests/integration/api/courses.test.ts`: GET/POST `/api/courses` (409 duplicate code), POST/PATCH/DELETE `/api/topics` [FR-009]
- [ ] T014 Implement `src/app/api/courses/route.ts` + `src/app/api/topics/route.ts` + `src/app/api/topics/[id]/route.ts` with zod validation → T013 green
- [ ] T015 Write failing a11y component test `tests/a11y/shell.test.tsx` (vitest-axe, focus management), then implement app shell: `src/app/layout.tsx` (mobile-first), `src/components/BottomTabs.tsx`, `src/app/unlock/page.tsx` [FR-028]

**Checkpoint**: Gate + DB + courses/topics ready — user stories can begin

---

## Phase 3: User Story 1 - Document Library with a page-citing assistant (Priority: P1) 🎯 MVP

**Goal**: Upload a PDF to a topic, read it page-by-page, ask an overlay assistant that answers only from the document with exact page citations, tap-to-jump, refusal when unanswerable, Gemini→local→FR-030 fallback chain.

**Independent Test**: quickstart.md scenario 1 — upload → ask answerable + unanswerable questions → citation jump → forced-fallback drill → double-failure drill.

### Tests & Implementation for User Story 1 (MANDATORY per constitution Principle I) ⚠️

- [ ] T016 [US1] `documents` + `document_chunks` schema + migration with HNSW cosine index on `embedding vector(384)`; DB CHECK `page_number ≥ 1` only — upper bound is app-layer (data-model.md)
- [ ] T017 [P] [US1] Write failing unit tests `tests/unit/rag/chunking.test.ts`: ~400-token page-aware chunks, never cross pages, sequential `chunk_index`, `page_number` preserved [US1-AC1]
- [ ] T018 [US1] Implement `src/lib/rag/chunking.ts` → T017 green
- [ ] T019 [P] [US1] Write failing unit tests `tests/unit/rag/embed.test.ts`: wrapper contract — 384-dim output, batching, injected pipeline stub, single model id (`multilingual-e5-small`) shared by server and client entries (research.md R3)
- [ ] T020 [US1] Implement `src/lib/rag/embed.ts` → T019 green
- [ ] T021 [US1] Write failing integration tests `tests/integration/api/documents.test.ts`: POST → 202 `processing` → `ready` with chunks embedded; `page_number > page_count` → 422 (app-layer bound); corrupt/non-PDF → status `failed` + explicit error (spec edge case); GET document; GET `/chunks` returns `{id, pageNumber, content, embedding}` [FR-001, US1-AC1]
- [ ] T022 [US1] Implement `src/app/api/documents/route.ts`, `[id]/route.ts`, `[id]/chunks/route.ts` + Vercel Blob client-upload token route `src/app/api/blob/route.ts` → T021 green
- [ ] T023 [P] [US1] Write failing unit tests `tests/unit/ai/classify.test.ts` for `classifyGeminiError`: abort → `timeout`; 429/RESOURCE_EXHAUSTED → `quota`; fetch TypeError → `network`; malformed body → `invalid_response` [Principle V]
- [ ] T024 [US1] Implement `src/lib/ai/types.ts` (FailureClass taxonomy, AnswerEngine interface) + `src/lib/ai/gemini.ts` (10 s AbortController timeout, classification, structured logs) → T023 green
- [ ] T025 [P] [US1] Write failing unit tests `tests/unit/ai/fallback.test.ts` for the `nextChainState` reducer + `askWithFallback`: any Gemini failure class → local attempted; any local failure class (`unsupported|oom|not_cached|inference_error`) → `{ok:false, state:'unavailable'}`; engine always disclosed; exactly one log event per transition with correct `expected_degradation` [FR-008, FR-030, US1-AC7, US1-AC8]
- [ ] T026 [US1] Implement `src/lib/ai/fallback.ts` → T025 green
- [ ] T027 [P] [US1] Write failing unit tests `tests/unit/ai/local.test.ts` with injected stubs: no `navigator.gpu` → `unsupported`; init OOM → `oom`; offline + weights not in Cache Storage → `not_cached`; crash → `inference_error`; two-profile model constant selected by `deviceMemory` (research.md R2, R4)
- [ ] T028 [US1] Implement `src/lib/ai/local.ts` (transformers.js WebGPU, load-progress callback, Cache Storage weights) → T027 green
- [ ] T029 [US1] Write failing integration tests `tests/integration/api/assistant.test.ts` (MSW): `POST /api/assistant/ask` success → answer + `citations[{page, chunkId}]` + engine `gemini` [US1-AC4]; unanswerable → explicit FR-007 refusal, zero invented citations [US1-AC6]; simulated timeout/quota/network → `502 {failureClass}` [US1-AC7]; `POST /api/assistant/retrieve` → top-k chunks with `pageNumber`, scoped to the single document [FR-004]
- [ ] T030 [US1] Implement `src/lib/rag/retrieve.ts` (pgvector cosine top-k=6, document-scoped) + `src/app/api/assistant/ask/route.ts` (grounded prompt: answer only from chunks, cite `[p. N]`, refuse otherwise) + `src/app/api/assistant/retrieve/route.ts` → T029 green
- [ ] T031 [P] [US1] Write failing unit tests `tests/unit/rag/local-retrieve.test.ts`: cosine top-k ordering over cached chunks; insufficient-cache detection returns a retrieval-failure signal (research.md R1-B)
- [ ] T032 [US1] Implement `src/lib/rag/local-retrieve.ts` + IndexedDB cache warm on document open (GET `/chunks` → IndexedDB) → T031 green
- [ ] T033 [US1] Write failing integration tests `tests/integration/api/messages.test.ts`: one thread per document; POST/GET messages; on double failure the user question persists with status `pending_retry` and is retryable [FR-030, US1-AC8]
- [ ] T034 [US1] Implement `assistant_threads`/`assistant_messages` schema + migration + `src/app/api/documents/[id]/messages/route.ts` → T033 green
- [ ] T035 [US1] Write failing a11y/component tests `tests/a11y/viewer.test.tsx`, then implement Library UI: `src/app/library/*` (upload flow, Subir/Visor/Asistente bottom-tabs) + `src/components/PdfViewer.tsx` (pdfjs-dist page render, page nav, zoom) [FR-002, US1-AC2, FR-028]
- [ ] T036 [US1] Write failing a11y/component tests `tests/a11y/assistant.test.tsx`, then implement assistant overlay: opens over viewer without route change [US1-AC3]; citation chips tap → viewer jumps to page [US1-AC5, FR-006]; engine badge [US1-AC7]; FR-030 unavailable state with preserved question + retry [US1-AC8, FR-028]
- [ ] T037 [US1] Playwright `e2e/us1-library.spec.ts`: full journey per quickstart scenario 1, incl. forced-fallback drill (Gemini route blocked) and double-failure drill (Gemini blocked + WebGPU disabled)

**Checkpoint**: US1 fully functional and independently testable — MVP deliverable

---

## Phase 4: User Story 2 - Topic management and spaced-repetition engine (Priority: P2)

**Goal**: Courses/topics management, flashcards, the pure SM-2 engine over Flashcards AND Bank Questions (incl. the FR-018 asymmetry), due queue, review flow, home dashboard.

**Independent Test**: quickstart.md scenario 2 — create card → due today → outcomes over simulated days → counts and ease/interval invariants; `review_logs.schedule_changed` asymmetry check.

### Tests & Implementation for User Story 2 (MANDATORY per constitution Principle I) ⚠️

- [ ] T038 [US2] `flashcards` + `bank_questions` schema with SM-2 column group (defaults `next_review_at = CURRENT_DATE`, `interval_days 0`, `ease_factor 2.5`, CHECK `≥ 1.3`) + `review_logs` (with `schedule_changed`) + migration (data-model.md)
- [ ] T039 [P] [US2] Write failing fast-check property tests `tests/property/engine/sm2.property.test.ts` for invariants E1–E8 (contracts/engine.md §1), AC ids in titles: "US2-AC2: correct in review never decreases interval", "US2-AC3/AC6: incorrect resets to 1 day, never past", "US2-AC4: ease ≥ 1.3 always", "US2-AC7: trainer/exam-correct is a no-op", "US2-AC1/FR-011: new item due on creation day", determinism [Principle III]
- [ ] T040 [P] [US2] Write failing example-based unit tests `tests/unit/engine/sm2.test.ts`: canonical SM-2 sequences (1d → 6d → round(prev×EF)), hard behavior (E6), `isDue` predicate (SC-003)
- [ ] T041 [US2] Implement `src/lib/engine/sm2.ts` (pure, `today` injected — never `Date.now()` inside) → T039 + T040 green
- [ ] T042 [US2] Run Stryker scoped to `src/lib/engine/`; add mutant-killing tests until mutation score ≥ 80% (Principle II gate — record score)
- [ ] T043 [P] [US2] Write failing integration tests `tests/integration/api/flashcards.test.ts`: flashcard CRUD; new card due same day [FR-010, FR-011, US2-AC1]
- [ ] T044 [US2] Implement `src/app/api/flashcards/route.ts` + `[id]/route.ts` → T043 green
- [ ] T045 [US2] Write failing integration tests `tests/integration/api/review.test.ts`: `POST /api/review/answer` across outcomes × contexts — `review_logs.schedule_changed = false` for trainer/exam-correct [US2-AC7], override on incorrect in any context [US2-AC6]; `GET /api/review/due` — union of both item types, today/week horizons, counts by type/topic/course, most-overdue first [FR-013, FR-014, FR-018, US2-AC5, SC-003]
- [ ] T046 [US2] Implement `src/app/api/review/answer/route.ts` + `src/app/api/review/due/route.ts` + due-queue queries in `src/lib/db/queries.ts` → T045 green
- [ ] T047 [US2] Write failing a11y/component tests `tests/a11y/review.test.tsx`, then implement: course/topic management UI `src/app/courses/*` [FR-009], review flow `src/app/review/*` (card reveal, correct/incorrect/hard), home dashboard due-today across all courses `src/app/page.tsx` [US2-AC5, SC-007, FR-028]
- [ ] T048 [US2] Playwright `e2e/us2-review.spec.ts`: quickstart scenario 2 incl. `db:timeshift` day simulation

**Checkpoint**: US1 and US2 independently functional

---

## Phase 5: User Story 3 - Entrenador: untimed practice (Priority: P3)

**Goal**: Bank-question authoring, untimed trainer sessions with feedback-before-advance, failed answers feed the SM-2 override; correct answers leave schedules untouched.

**Independent Test**: quickstart.md scenario 3 — session on seeded topic, no timer, per-answer feedback, failed question lands in due queue.

### Tests & Implementation for User Story 3 (MANDATORY per constitution Principle I) ⚠️

- [ ] T049 [P] [US3] Write failing integration tests `tests/integration/api/bank-questions.test.ts`: CRUD with prompt/correctAnswer/explanation [FR-031, US3-AC1]
- [ ] T050 [US3] Implement `src/app/api/bank-questions/route.ts` + `[id]/route.ts` → T049 green
- [ ] T051 [US3] Write failing integration tests `tests/integration/api/trainer.test.ts`: POST sessions → frozen `question_ids` draw, 422 on empty bank (spec edge case) [FR-015, FR-016, US3-AC2]; GET resume at `current_index` [FR-029]; POST answers → `{isCorrect, explanation, review.scheduleChanged}` — incorrect → SM-2 override, correct → no-op [FR-017, FR-018, US3-AC4, US3-AC5]
- [ ] T052 [US3] Implement `trainer_sessions` + `session_answers` schema + migration + `src/app/api/trainer/sessions/*` routes + `src/lib/session/trainer.ts` → T051 green
- [ ] T053 [US3] Write failing a11y/component tests `tests/a11y/trainer.test.tsx`, then implement Trainer UI `src/app/trainer/*`: no timer [US3-AC3], feedback + explanation before advancing [US3-AC4], bank-question authoring screens [FR-031, FR-028]
- [ ] T054 [US3] Playwright `e2e/us3-trainer.spec.ts`: quickstart scenario 3

**Checkpoint**: US1–US3 independently functional

---

## Phase 6: User Story 4 - Timed exam simulator (Priority: P4)

**Goal**: Configurable timed exams with a server-authoritative clock, auto-stop + grading at zero, score report with failed breakdown, SM-2 override for failures, real-elapsed-time resume.

**Independent Test**: quickstart.md scenario 4 — short exam runs to timeout, auto-grades ≤ 5 s, close/reopen preserves real elapsed time, reopen-after-expiry shows graded report.

### Tests & Implementation for User Story 4 (MANDATORY per constitution Principle I) ⚠️

- [ ] T055 [P] [US4] Write failing property + unit tests `tests/property/scoring/timer.property.test.ts` + `tests/unit/scoring/timer.test.ts`: `remainingMs ≥ 0` (clamped), monotone non-increasing in `now`, `isExpired ⇔ remainingMs = 0`, resume equals real elapsed time [FR-020, FR-029, US4-AC5, US4-AC6, Principle III]
- [ ] T056 [US4] Implement `src/lib/scoring/timer.ts` → T055 green
- [ ] T057 [P] [US4] Write failing property + unit tests `tests/property/scoring/grade.property.test.ts` + `tests/unit/scoring/grade.test.ts`: `0 ≤ correct ≤ answered ≤ total`; unanswered counted wrong; `failed` = wrong ∪ unanswered; `scorePct` formula [FR-020, FR-021, US4-AC2, US4-AC3]
- [ ] T058 [US4] Implement `src/lib/scoring/grade.ts` → T057 green
- [ ] T059 [US4] Run Stryker scoped to `src/lib/scoring/`; kill mutants to ≥ 80% (Principle II gate — record score)
- [ ] T060 [US4] Write failing integration tests `tests/integration/api/exam.test.ts`: create → server `started_at`, 422 empty bank [US4-AC1]; GET past deadline auto-finalizes [US4-AC6]; answers after expiry → 409 rejected [FR-020]; finalize idempotent → report + SM-2 override for failed questions [FR-021, US4-AC3, US4-AC4]; GET returns server-computed `remainingMs` for resume [US4-AC5, FR-029]
- [ ] T061 [US4] Implement `exam_sessions` schema + migration + `src/app/api/exam/sessions/*` routes + `src/lib/session/exam.ts` → T060 green
- [ ] T062 [US4] Write failing a11y/component tests `tests/a11y/exam.test.tsx`, then implement Exam UI `src/app/exam/*`: duration config, countdown rendered from server values (cosmetic only), report screen with score + failed breakdown, resume/expired states [US4-AC2, US4-AC3, US4-AC5, US4-AC6, FR-028]
- [ ] T063 [US4] Playwright `e2e/us4-exam.spec.ts`: quickstart scenario 4 (expiry, close/reopen)

**Checkpoint**: US1–US4 independently functional

---

## Phase 7: User Story 5 - Feynman mode with AI evaluation (Priority: P5)

**Goal**: Free-text explanation → structured correct/missing/wrong feedback, grounded in the topic's Library documents with page citations, engine disclosure, full fallback chain terminating in FR-030 with the explanation preserved.

**Independent Test**: quickstart.md scenario 5 — normal evaluation with citation, forced-local drill, double-failure drill with preserved text.

### Tests & Implementation for User Story 5 (MANDATORY per constitution Principle I) ⚠️

- [ ] T064 [US5] `feynman_submissions` (status `submitted|pending_retry|evaluated`, default `submitted`, transitions per data-model.md) + `ai_evaluations` schema + migration
- [ ] T065 [P] [US5] Write failing unit tests `tests/unit/ai/feynman-eval.test.ts`: `normalizeEvaluation` never throws; malformed → `{error:'invalid_response'}` (feeds fallback chain); invalid citation pages dropped, never invented; identical output shape for Gemini and local raw input [FR-023, FR-024, US5-AC1, US5-AC2]
- [ ] T066 [US5] Implement `src/lib/ai/feynman-eval.ts` → T065 green
- [ ] T067 [US5] Run Stryker scoped to `src/lib/ai/feynman-eval.ts`; ≥ 80% (Principle II gate — record score)
- [ ] T068 [US5] Write failing integration tests `tests/integration/api/feynman.test.ts` (MSW): POST submissions → status `submitted`, 422 empty/oversize (spec edge case); `POST …/evaluate` → Gemini structured output + topic-document citations, sets `evaluated` [US5-AC1, US5-AC2]; simulated timeout/quota/network → `502 {failureClass}` [US5-AC3]; `POST /api/feynman/retrieve` → multi-document chunks `{chunkId, documentId, pageNumber, content}`, `[]` when topic has no ready documents; `POST …/evaluations` (engine `local`) → `evaluated`; `PATCH …/retry-state` idempotent, 409 if already `evaluated` [FR-030, US5-AC5]
- [ ] T069 [US5] Implement `src/app/api/feynman/*` routes (submissions, evaluate, retrieve, evaluations, retry-state) → T068 green
- [ ] T070 [US5] Write failing unit tests `tests/unit/ai/feynman-fallback.test.ts` for the client Scenario-B grounding decision (contracts/api.md): topic has ready docs + cache absent/insufficient → FR-030, NEVER ungrounded; no ready docs → ungrounded allowed (citations omitted); local engine failure → retry-state queued for reconnection [US5-AC5]
- [ ] T071 [US5] Implement client Feynman fallback wiring `src/app/feynman/fallback-client.ts` (askWithFallback + grounding rules + retry-state queue) → T070 green
- [ ] T072 [US5] Write failing a11y/component tests `tests/a11y/feynman.test.tsx`, then implement Feynman UI `src/app/feynman/*`: explanation editor, structured feedback display (correct/missing/wrong/suggestions + citations), engine badge [FR-025, US5-AC4], unavailable state with preserved explanation [US5-AC5, FR-028]
- [ ] T073 [US5] Playwright `e2e/us5-feynman.spec.ts`: quickstart scenario 5 (normal, forced local, double failure preserved)

**Checkpoint**: All five user stories independently functional

---

## Phase 8: Polish & Cross-Cutting Concerns

- [ ] T074 [P] Seed + dev scripts: `scripts/seed.ts` (course IS-481, topic, sample cards/questions, PDF fixture) and `scripts/timeshift.ts` (`db:timeshift`, dev-only)
- [ ] T075 [P] Playwright a11y sweep `e2e/a11y-sweep.spec.ts`: every screen in seeded state, WCAG 2.1 A/AA, zero critical violations [SC-008, FR-028]
- [ ] T076 Full Stryker run across all three scopes, confirm ≥ 80% each; record scores in `docs/quality-report.md` (Principle II evidence)
- [ ] T077 [P] Traceability table `docs/traceability.md`: every AC (US1-AC1..8, US2-AC1..7, US3-AC1..5, US4-AC1..6, US5-AC1..5), FR-001..FR-031, SC-001..SC-008 → test `file::name` (Principle IV)
- [ ] T078 Manual a11y spot-checks on Exam and Feynman screens (constitution Principle VI); record findings + fixes in `docs/quality-report.md`
- [ ] T079 Observability audit: every I/O boundary (AI calls, DB writes, timer finalization) emits structured events; `expected_degradation` correctly separates fallback-by-design from defects; add any missing [Principle VIII]
- [ ] T080 [P] `README.md`: setup, env vars, test commands, architecture summary (academic deliverable, constitution §Academic Deliverables)
- [ ] T081 Run quickstart.md validation scenarios 1–5 end-to-end; fix anything that breaks
- [ ] T082 Vercel deploy: project config + env vars; post-deploy smoke — passcode gate rejects/admits, data visible from a second device [FR-027]
- [ ] T083 Run `/speckit-analyze` and resolve any spec/plan/tasks drift (constitution §Governance compliance review)

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)** → nothing
- **Foundational (Phase 2)** → Setup. BLOCKS all user stories.
- **User Stories (Phases 3–7)** → Foundational. Priority order P1→P5 is the recommended solo sequence.
- **Polish (Phase 8)** → all desired user stories complete.

### Cross-Story Dependencies (module reuse, not test coupling)

- **US3 → US2**: trainer answers call the SM-2 engine + `/api/review/answer` (T041, T046).
- **US4 → US3**: exams reuse `bank_questions` CRUD (T050) and `session_answers` (T052).
- **US5 → US1**: Feynman grounding reuses `src/lib/rag/*` (T018/T020/T030/T032) and `src/lib/ai/{gemini,local,fallback}` (T024/T026/T028). If US5 were built before US1, those lib tasks move with it.
- Each story remains independently *testable* per its quickstart scenario once its dependencies' phases are done.

### Within Each Story

- Test task MUST fail before its paired implementation task (Principle I — no exceptions).
- Schema → pure logic → API routes → UI → e2e.
- Stryker gate tasks (T042, T059, T067) block their story's checkpoint.

### Parallel Opportunities

- Phase 1: T003–T007 in parallel after T001–T002.
- US1: T017, T019, T023, T025, T027, T031 (test authoring, different files) in parallel once T016 exists.
- US2: T039, T040, T043 in parallel after T038.
- US4: T055 and T057 in parallel.
- Polish: T074, T075, T077, T080 in parallel.

## Parallel Example: User Story 1

```bash
# After T016, author these failing test suites together:
Task: "T017 unit tests for page-aware chunking in tests/unit/rag/chunking.test.ts"
Task: "T019 unit tests for embed wrapper in tests/unit/rag/embed.test.ts"
Task: "T023 unit tests for classifyGeminiError in tests/unit/ai/classify.test.ts"
Task: "T025 unit tests for fallback chain in tests/unit/ai/fallback.test.ts"
Task: "T027 unit tests for local engine failure classes in tests/unit/ai/local.test.ts"
```

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Phase 1 (Setup) → Phase 2 (Foundational) → Phase 3 (US1).
2. **STOP and VALIDATE**: quickstart scenario 1, including both fallback drills.
3. Deploy to Vercel — a usable "chat with your PDF, cited by page" app is the MVP.

### Incremental Delivery

Each subsequent phase (US2 → US3 → US4 → US5) ends at a checkpoint validated by its quickstart scenario and its e2e spec; deploy after any checkpoint. The mutation gates (T042, T059, T067) and the traceability table (T077) are non-negotiable before calling the feature done.

## Notes

- [P] = different files, no incomplete dependencies.
- Every test task's titles carry AC/FR ids — T077 consolidates them; a task may not be checked off if its ACs lack a linked test (Principle IV).
- Pure modules take `today`/`now` as parameters (contracts/engine.md) — never `Date.now()` inside.
- Commit after each task or red-green pair; keep the failing-test commit separate from the green commit where practical (visible TDD evidence, constitution §Development Workflow).
