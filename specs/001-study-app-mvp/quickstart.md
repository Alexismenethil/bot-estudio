# Quickstart & Validation Guide: Personal Study App Core Features

**Feature**: `001-study-app-mvp` | **Date**: 2026-07-05
References: [plan.md](./plan.md) · [data-model.md](./data-model.md) · [contracts/](./contracts/)

## Prerequisites

- Node.js 20+, pnpm 9+
- A Neon Postgres database (free tier) with `pgvector` available
- A Gemini API key (free tier is fine for dev)
- Vercel account (deploy) + Vercel Blob store token
- A WebGPU-capable browser for local-fallback testing (Chrome/Edge current); the app itself must still work without WebGPU (fallback failure → FR-030 path)

## Environment

`.env.local`:

```bash
DATABASE_URL=postgres://...          # Neon connection string
APP_PASSCODE=...                     # entry lock (FR-026)
SESSION_SECRET=...                   # ≥32 random bytes, cookie signing
GEMINI_API_KEY=...
BLOB_READ_WRITE_TOKEN=...            # Vercel Blob
```

## Setup & run

```bash
pnpm install           # package.json MUST pin "next": "^16.2.10" — the passcode
                       # gate uses Next 16's proxy.ts convention (middleware is
                       # deprecated/renamed to proxy in Next 16; middleware.ts is
                       # prohibited in this project; see research.md R6)
pnpm db:migrate        # drizzle-kit: migration 0001 runs CREATE EXTENSION vector
pnpm dev               # http://localhost:3000 → redirects to /unlock (proxy.ts gate)
```

## Test commands (constitution gates)

```bash
pnpm test              # Vitest: unit + property + integration (TDD loop, Principle I)
pnpm test:property     # fast-check suites only (Principle III)
pnpm test:mutation     # Stryker vitest-runner; FAILS below 80% on engine/scoring/feynman-eval (Principle II)
pnpm test:a11y         # Vitest + axe component accessibility tests (Principle VI)
pnpm test:e2e          # Playwright user-story flows
pnpm playwright test e2e/a11y-sweep.spec.ts  # seeded WCAG 2.1 A/AA sweep (SC-008)
```

Definition of mergeable = all five green + traceability table updated (Principle IV) + manual a11y spot-check noted for Exam/Feynman screens.

## End-to-end validation scenarios

Each proves one story independently (spec's Independent Test criteria). Run seeded: `pnpm db:seed` creates course IS-481 with one topic, sample cards/questions.

1. **US1 — Library & citing assistant**: Upload a sample PDF to the topic → viewer opens with page nav/zoom → ask a question answered by the doc → response shows `p. N` citation → tap citation → viewer jumps to page N → ask an unrelated question → explicit "cannot answer from this document" refusal. Fallback drill: block `generativelanguage.googleapis.com` in DevTools → ask again → local engine badge appears; additionally disable WebGPU flag → ask → FR-030 message and the question stays in the thread as `pending_retry`.
2. **US2 — SM-2 engine**: Create a flashcard → appears in today's queue. Answer correct → interval grows; simulate days (`pnpm db:timeshift +3d`, dev-only script) → answer incorrect → due tomorrow, ease never < 1.3. Bank question failed in Trainer appears rescheduled; answered correct in Trainer → schedule untouched (compare `review_logs.schedule_changed`).
3. **US3 — Trainer**: Start session on seeded topic → no timer visible → per-answer feedback with explanation → fail one question → it appears in the due queue.
4. **US4 — Exam**: Configure 2-minute exam → answer some questions → let it expire → auto-finalized report ≤ 5 s with score + failed breakdown; close the tab mid-exam, reopen → timer reflects real elapsed time; reopen after expiry → already graded.
5. **US5 — Feynman**: Submit an explanation for the topic with the uploaded doc → structured correct/missing/wrong feedback with engine badge and page citation; repeat with Gemini blocked → local badge; repeat with Gemini blocked + WebGPU off → "temporarily unavailable" and the explanation text still present on reload.

## Deploy

```bash
vercel link && vercel env pull
vercel deploy --prod    # set the four env vars in Vercel project settings first
```

Post-deploy smoke: `/unlock` gate rejects wrong passcode; correct passcode grants access from a second device (central store check, FR-027).
