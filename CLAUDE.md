# bot-estudio — Agent Context

Personal study web app (single user) built with Spec-Driven Development for a
university Software QA course. The testing rigor IS the graded deliverable.

## Governance

- Constitution: `.specify/memory/constitution.md` (v1.0.0) — 8 principles; I (TDD)
  and II (mutation ≥80%) are NON-NEGOTIABLE.
- Active feature: `specs/001-study-app-mvp/` (spec.md, plan.md, research.md,
  data-model.md, contracts/, quickstart.md). Feature dir pointer:
  `.specify/feature.json`.

## Stack (decided in plan/research — do not re-litigate)

- Next.js 15 App Router + TypeScript strict, Tailwind 4, deployed on Vercel.
- Neon Postgres + pgvector (384-dim, multilingual-e5-small) via Drizzle ORM;
  PDFs in Vercel Blob; pdfjs-dist for viewer + per-page extraction.
- AI: Gemini (`@google/genai`, gemini-2.5-flash) primary; in-browser WebGPU
  fallback via transformers.js (Phi-3-mini q4f16, low-mem profile
  Qwen2.5-1.5B q4). Fallback chain in `src/lib/ai/fallback.ts`; double failure
  ⇒ FR-030 "unavailable + input preserved". Local-engine unavailability
  (no WebGPU / OOM / model not cached) = local failure, same FR-030 path.
- RAG: retrieval always (never whole-doc stuffing). Server pgvector top-k when
  backend reachable (even if Gemini down); IndexedDB chunk cache + client
  embedding for offline; page citations come from chunk `page_number` metadata.
- Access: passcode middleware (signed HMAC cookie, jose + Web Crypto, Edge-safe).

## Testing (constitution-gated)

- Vitest everywhere; strict TDD Red-Green-Refactor, tests named with AC ids
  (`US2-AC3 ...`) for traceability (Principle IV).
- Stryker (`@stryker-mutator/vitest-runner`), break threshold 80%, scoped to
  `src/lib/engine/**`, `src/lib/scoring/**`, `src/lib/ai/feynman-eval.ts`.
- fast-check property suites for SM-2, exam scoring, timer math.
- Playwright + @axe-core/playwright: every screen, zero critical violations
  (WCAG 2.1 AA); vitest-axe on components.

## Domain rules that trip people up

- SM-2 applies to BOTH Flashcards and Bank Questions (same column group, same
  pure engine `sm2Next`). Asymmetry (FR-018): incorrect in Trainer/Exam
  overrides the schedule immediately; correct in Trainer/Exam is a NO-OP —
  only the official review (context='review') advances the schedule.
- Exam timer is server-authoritative arithmetic (`started_at + duration`),
  never a client countdown; expiry can be observed by any request.
- Pure logic modules take `today`/`now` as parameters — no Date.now() inside.
- App language/content is Spanish; embeddings must stay multilingual.
