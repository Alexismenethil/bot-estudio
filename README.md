# bot-estudio

Personal study app MVP built with Next.js, TypeScript, Drizzle, Neon/Postgres + pgvector, Gemini, and a browser-local fallback path.

## Setup

```bash
pnpm install
cp .env.local.example .env.local
pnpm db:migrate
pnpm db:seed
pnpm dev
```

Required environment variables:

```bash
DATABASE_URL=postgres://...
APP_PASSCODE=...
SESSION_SECRET=... # at least 32 bytes
GEMINI_API_KEY=...
BLOB_READ_WRITE_TOKEN=...
```

`pnpm db:seed` creates the IS-481 sample course/topic, sample flashcards, Bank Questions, document metadata/chunks, and the PDF fixture at `public/fixtures/is481-sample.pdf`.

`pnpm db:timeshift +3d` or `pnpm db:timeshift -2d` shifts review dates and active exam `started_at` values for local scheduling drills.

## Test Commands

```bash
pnpm exec tsc --noEmit
pnpm lint
pnpm test
pnpm test:property
pnpm test:a11y
pnpm test:mutation
pnpm playwright test e2e/us1-library.spec.ts e2e/us2-review.spec.ts e2e/us3-trainer.spec.ts e2e/us4-exam.spec.ts e2e/us5-feynman.spec.ts
pnpm playwright test e2e/a11y-sweep.spec.ts
```

Mutation thresholds are enforced by `stryker.config.json` across:

- `src/lib/engine/**/*.ts`
- `src/lib/scoring/**/*.ts`
- `src/lib/ai/feynman-eval.ts`

## Architecture

- `src/app/api/*`: App Router API routes for Library, review, Trainer, Exam, and Feynman workflows.
- `src/app/*`: client UI surfaces for dashboard, Library, Courses, Review, Trainer, Exam, and Feynman.
- `src/lib/engine/sm2.ts`: pure spaced-repetition engine with injected `today`.
- `src/lib/scoring/*`: pure exam grading and timer math.
- `src/lib/rag/*`: page-aware chunking, embeddings, pgvector retrieval, and local IndexedDB retrieval.
- `src/lib/ai/*`: Gemini boundary, local/primary failure taxonomy, Feynman evaluation normalization and citation filtering.
- `src/lib/session/*`: Trainer and Exam persistence helpers.
- `src/lib/logging.ts`: structured JSON events for AI calls, DB writes, and timer finalization.

## Validation

The feature spec lives in `specs/001-study-app-mvp/`. Final evidence is consolidated in:

- `docs/traceability.md`
- `docs/quality-report.md`
- `reports/mutation/mutation.html`

Active Trainer and Exam sessions resume only from the same device/browser via the local `sessionId` pointer. General study data remains centrally persisted through the database.

## Deploy

Configure the same environment variables in Vercel, then:

```bash
vercel link
vercel env pull
vercel deploy --prod
```

Post-deploy smoke: `/unlock` rejects the wrong passcode, accepts the correct one, and seeded central data is visible from a second browser/device.
