# Implementation Plan: Personal Study App Core Features

**Branch**: `001-study-app-mvp` | **Date**: 2026-07-05 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/001-study-app-mvp/spec.md`

**Note**: This template is filled in by the `/speckit-plan` command. See `.specify/templates/plan-template.md` for the execution workflow.

## Summary

Single-user, mobile-first study web app with five independently deliverable stories:
PDF Library with a page-citing RAG assistant (P1), SM-2 spaced-repetition engine over
Flashcards and Bank Questions (P2), untimed Trainer (P3), timed Exam simulator (P4),
and Feynman-mode AI evaluation (P5). Technical approach: one Next.js 16 (App Router,
TypeScript) app on Vercel; Postgres (Neon) + pgvector as the central store and RAG
index; Gemini as primary AI with an in-browser WebGPU model (transformers.js) as
automatic fallback; a passcode gate in `src/proxy.ts` instead of user accounts. Business
logic (SM-2, exam scoring, Feynman evaluation parsing) lives in pure TypeScript
modules that are TDD'd, mutation-tested (Stryker ≥80%), and property-tested
(fast-check) per the constitution.

## Technical Context

**Language/Version**: TypeScript 5.x (strict), Node.js 20+ runtime on Vercel; browser ES2022

**Primary Dependencies**: Next.js 16 (App Router; `next` pinned to `^16.2.10` in
`package.json` at scaffold time — the access gate depends on Next 16's `proxy.ts`
convention), Tailwind CSS 4, Drizzle ORM +
`@neondatabase/serverless`, `@google/genai` (Gemini API), `@huggingface/transformers`
(transformers.js v4, WebGPU) for the local fallback LLM and client/server embeddings,
`pdfjs-dist` (viewer + per-page text extraction), `@vercel/blob` (PDF file storage),
`jose`/Web Crypto (signed passcode cookie)

**Storage**: Neon Postgres with `pgvector` extension (all study data + document chunks
with 384-dim embeddings and `page_number`); Vercel Blob for the PDF binaries;
IndexedDB (client) as a read-through cache of the open document's chunks + embeddings
for the no-connectivity fallback path

**Testing**: Vitest (unit/component/integration, TDD Red-Green-Refactor); Postgres
integration tests run against PGlite + pgvector (hermetic, in-process, no live Neon
needed in CI/local runs); `@stryker-mutator/vitest-runner` (mutation testing, break
threshold 80% on `src/lib/engine`, `src/lib/scoring`, `src/lib/ai/feynman-eval`);
fast-check (property-based tests for SM-2, scoring, timer math); Playwright +
`@axe-core/playwright` (screen-level WCAG 2.1 AA sweep) and vitest-axe (component
level); MSW to simulate Gemini timeout / 429 / network-failure

**Target Platform**: Vercel (serverless/edge); browsers: mobile-first (Android
Chrome / iOS Safari), desktop Chromium/Firefox/Safari; WebGPU local model is
progressive enhancement, never a hard requirement

**Project Type**: Web application — single Next.js project (unified frontend +
backend route handlers)

**Performance Goals**: First assistant answer (Gemini path) ≤ 15 s p95; exam score
report ≤ 5 s after exam end (SC-005); due-queue and page navigation interactions
≤ 200 ms perceived; local-model first token ≤ 30 s after model warm (fallback path
is explicitly allowed to be slower, but must be visibly progressing)

**Constraints**: Local fallback model + embeddings must fit a mid-range phone
(≤ ~1.5 GB model download, q4 quantization, WebGPU with graceful absence);
single-document RAG scope (no cross-document search); no offline-first requirement
— only the already-open document degrades gracefully offline; passcode gate on every
route (FR-026); all AI calls wrapped in the timeout/quota/no-connectivity fallback
chain (FR-008, FR-030)

**Scale/Scope**: 1 user; ~10 courses × ~10 topics; ≤ ~200 documents (PDFs ≤ ~50 MB,
≤ ~500 pages); ≤ ~10k spaced-repetition items; ~5 top-level screens + overlays.
Scale is trivial — correctness and test rigor are the graded dimensions, not
throughput.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| # | Principle | How this plan complies | Status |
|---|-----------|------------------------|--------|
| I | Test-First (TDD) | Every task in Phase 2 orders: write test from AC → observe red → implement → green. Business logic is pure modules with no I/O so unit tests need no mocks. Vitest is the single runner. | PASS |
| II | Mutation-Verified Business Logic | Stryker (vitest-runner) scoped to `src/lib/engine/**` (SM-2), `src/lib/scoring/**` (exam grading), `src/lib/ai/feynman-eval*` (evaluation structuring), with `thresholds.break: 80`. CI-style gate documented in quickstart. | PASS |
| III | Property-Based Testing | fast-check suites required for: SM-2 transition function (interval monotonicity on correct, reset bounds on incorrect, ease ≥ 1.3, Trainer/Exam-correct is a no-op), exam scoring (score bounds, partial-answer grading), timer math (resume with real elapsed time never yields negative remaining). | PASS |
| IV | Requirement Traceability | Test names embed AC ids (`US2-AC3 …`); a traceability table (AC → test file::name) is a deliverable of the tasks phase and required before any task is checked off. | PASS |
| V | AI Resilience & Graceful Degradation | Single `askWithFallback()` boundary used by US1 and US5: Gemini (10 s timeout, 429/quota, network error) → local WebGPU engine → FR-030 unavailable state with input preserved. Local-engine unavailability (no WebGPU, low memory, model not cached while offline) is a local-engine *failure*, feeding the same FR-030 path. Each failure mode has a dedicated MSW-simulated test. | PASS |
| VI | Accessible, Mobile-First Interface | Tailwind mobile-first; bottom-tabs Library pattern (TutorPDF reference). Playwright+axe sweep over every screen (SC-008) plus vitest-axe on interactive components; manual spot-checks on Exam and Feynman screens per constitution. | PASS |
| VII | Simplicity & Reviewable Code | One Next.js project, no microservices. Engine/scoring/evaluation are pure functions decoupled from UI and from the LLM provider (a 2-implementation `AnswerEngine` interface: gemini, local). No speculative config surfaces. | PASS |
| VIII | Observability & Debuggable Failures | Structured JSON logger at every I/O boundary (AI calls, DB writes, timer grading): engine tried, failure class (timeout/quota/network/unsupported), fallback fired, latency. Expected-fallback logs are distinguishable (level=warn, `expected_degradation: true`) from defects (level=error). | PASS |

**Post-Phase-1 re-check**: design artifacts (data-model.md, contracts/) introduce no
new projects, no speculative abstractions, and keep all mutation-tested logic in pure
modules — all gates still PASS. No Complexity Tracking entries needed.

## Project Structure

### Documentation (this feature)

```text
specs/001-study-app-mvp/
├── plan.md              # This file (/speckit-plan command output)
├── research.md          # Phase 0 output (/speckit-plan command)
├── data-model.md        # Phase 1 output (/speckit-plan command)
├── quickstart.md        # Phase 1 output (/speckit-plan command)
├── contracts/
│   ├── api.md           # HTTP route-handler contracts
│   └── engine.md        # Pure-function contracts (SM-2, scoring, evaluation)
└── tasks.md             # Phase 2 output (/speckit-tasks command - NOT created by /speckit-plan)
```

### Source Code (repository root)

```text
src/
├── app/                          # Next.js App Router
│   ├── layout.tsx                # Root layout (mobile-first shell)
│   ├── unlock/page.tsx           # Passcode entry screen
│   ├── page.tsx                  # Home: due-today dashboard (SC-007)
│   ├── courses/                  # Course & topic management (US2)
│   ├── library/                  # US1: upload, viewer, assistant overlay (bottom-tabs)
│   ├── review/                   # US2: official SM-2 review flow
│   ├── trainer/                  # US3: untimed practice
│   ├── exam/                     # US4: timed exam + report
│   ├── feynman/                  # US5: explanation + evaluation
│   └── api/                      # Route handlers (see contracts/api.md)
├── proxy.ts                      # Passcode gate (Next 16): named export `proxy`, signed-cookie check on every route. middleware.ts is prohibited in this project (middleware is deprecated/renamed to proxy in Next 16); guarded by an integration test verifying uncookied requests redirect to /unlock
├── components/                   # Shared UI (accessible primitives, tabs, timers)
├── lib/
│   ├── engine/                   # SM-2 pure logic  ← Stryker + fast-check
│   ├── scoring/                  # Exam grading pure logic  ← Stryker + fast-check
│   ├── ai/
│   │   ├── types.ts              # AnswerEngine interface, failure taxonomy
│   │   ├── gemini.ts             # Primary engine (timeout/quota/network classified)
│   │   ├── local.ts              # WebGPU transformers.js engine (client)
│   │   ├── fallback.ts           # askWithFallback() chain → FR-030 state
│   │   └── feynman-eval.ts       # Structured-feedback parsing/validation ← Stryker
│   ├── rag/
│   │   ├── chunking.ts           # Page-aware chunking (server, at upload)
│   │   ├── embed.ts              # multilingual-e5-small, server & client entry
│   │   ├── retrieve.ts           # pgvector top-k (server)
│   │   └── local-retrieve.ts     # IndexedDB cosine top-k (client, offline path)
│   ├── db/                       # Drizzle schema + queries (see data-model.md)
│   ├── session/                  # Trainer/exam persistence, server-authoritative timer
│   └── logging.ts                # Structured JSON logger (Principle VIII)
tests/
├── unit/                         # Pure-logic tests (engine, scoring, feynman-eval, rag)
├── property/                     # fast-check suites (Principle III)
├── integration/                  # Route handlers + DB + AI fallback chain (MSW)
└── a11y/                         # vitest-axe component checks
e2e/                              # Playwright: flows + @axe-core/playwright sweep (SC-008)
```

**Structure Decision**: Single Next.js project (Option "web application, unified").
Frontend pages and backend route handlers live in one `src/app` tree; all
constitution-gated business logic is isolated under `src/lib/{engine,scoring,ai}` as
pure modules so Stryker/fast-check target them without UI or network involvement.

## Complexity Tracking

> No Constitution Check violations — table intentionally empty.
