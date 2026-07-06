# Quality Report

Feature: `001-study-app-mvp`  
Branch: `001-study-app-mvp`  
Last updated: 2026-07-06

## Automated Gates

| Gate | Command | Result |
| --- | --- | --- |
| TypeScript | `pnpm exec tsc --noEmit` | Passing |
| Lint | `pnpm lint` | Passing |
| Production build | `pnpm build` | Passing locally with elevated sandbox permissions |
| Unit/property/integration | `pnpm test` | Passing: 35 files, 179 tests |
| Component a11y | `pnpm test:a11y` | Passing: 7 files, 30 tests |
| Playwright a11y sweep | `pnpm playwright test e2e/a11y-sweep.spec.ts` | Passing: 2/2 projects |
| Quickstart e2e US1-US5 | `pnpm playwright test e2e/us1-library.spec.ts e2e/us2-review.spec.ts e2e/us3-trainer.spec.ts e2e/us4-exam.spec.ts e2e/us5-feynman.spec.ts` | Passing: 14/14 |
| Mutation | `pnpm test:mutation` | Passing: total 91.59%, threshold 80% |

## Mutation Evidence

Stryker config mutates the three constitution-scoped pure domains:

| Scope | File(s) | Score | Notes |
| --- | --- | ---: | --- |
| SM-2 engine | `src/lib/engine/sm2.ts` | 96.20% | Above 80% gate |
| Scoring/timer | `src/lib/scoring/grade.ts`, `src/lib/scoring/timer.ts` | 94.74% | `timer.ts` reached 100.00%; one no-coverage mutant remains in a defensive fallback string in `grade.ts` |
| Feynman evaluation normalization | `src/lib/ai/feynman-eval.ts` | 87.16% | Above 80% gate after US5 audit fix |
| Combined configured scope | all configured mutate targets | 91.59% | `reports/mutation/mutation.html` generated |

## Accessibility Sweep

Automated WCAG 2.1 A/AA sweep added in `e2e/a11y-sweep.spec.ts` and run against mobile Chrome and desktop Chromium seeded states.

Screens covered:

- Unlock gate and home dashboard
- Courses/topics/flashcard creation
- Review reveal/outcome controls
- Trainer authoring and active feedback
- Exam configuration, active timer, and report
- Feynman editor, evaluated feedback, and unavailable retry state
- Library empty state, PDF viewer, and assistant overlay

Findings fixed during Polish:

- PDF viewer page/zoom controls used low-contrast slate text. Raised to AA-safe slate text.
- Library bottom tabs were below AA contrast over the translucent fixed bar. Raised contrast and increased label size/weight.
- Assistant overlay left focusable viewer controls inside an `aria-hidden` background. Added `inert` while the dialog is open.

Final sweep result: zero WCAG 2.1 A/AA violations in both Playwright projects.

## Manual A11y Spot-Checks

Manual spot-checks were performed after the automated sweep on the two highest-risk interactive flows:

| Screen | Checks | Findings |
| --- | --- | --- |
| Exam | Keyboard reachability from topic/duration to answer textarea, timer readable without color-only meaning, report score labelled by `aria-label`, failed questions visible after finalize, mobile layout no text overlap | No remaining issues after automated contrast fixes |
| Feynman | Topic select and explanation editor labelled, 20,000 character guard visible, feedback sections have headings, engine disclosure visible, unavailable retry state uses `role=status`, preserved text remains editable | No remaining issues |

## Observability Audit

Structured logging uses `src/lib/logging.ts` and emits JSON lines with `boundary`, `message`, optional `engine`, `failure_class`, `latency_ms`, and `expected_degradation`.

Coverage added or confirmed:

- AI primary calls: `src/lib/ai/gemini.ts`, `src/lib/ai/feynman-gemini.ts`
- AI local fallback and double-failure path: `src/app/feynman/fallback-client.ts`
- Document ingestion writes: `src/app/api/documents/route.ts`
- Assistant message/thread persistence: `src/app/api/documents/[id]/messages/route.ts`
- Course/topic/flashcard/bank-question CRUD writes: `src/app/api/**`
- Review answer schedule updates and review logs: `src/app/api/review/answer/route.ts`
- Trainer session creation/progress, answers, review logs: `src/lib/session/trainer.ts`
- Exam session creation, answer writes, timer finalization, review logs: `src/lib/session/exam.ts`
- Feynman submission/evaluation/retry-state writes: `src/app/api/feynman/**`, `src/lib/feynman/persistence.ts`

Expected degradations are marked with `expected_degradation: true` for AI fallback/retry states. Timer finalization and DB writes are ordinary operational events and keep `expected_degradation` unset/false.

## Deployment Smoke

Vercel production deployment requires project credentials and environment variables outside this local workspace:

- `DATABASE_URL`
- `APP_PASSCODE`
- `SESSION_SECRET`
- `GEMINI_API_KEY`
- `BLOB_READ_WRITE_TOKEN`

Local readiness completed:

- `vercel.json` defines `pnpm install --frozen-lockfile`, `pnpm build`, and `pnpm dev`.
- `.vercelignore` excludes local build, mutation, Playwright, report, and dependency artifacts.
- Local `pnpm build` passes after removing the `next/font/google` network dependency.

Blocked external step:

- `vercel` CLI is not installed in this workspace.
- `.vercel/project.json` is absent.
- `VERCEL_TOKEN`, `VERCEL_ORG_ID`, and `VERCEL_PROJECT_ID` are not present in the shell environment.

Post-deploy smoke checklist remains pending until credentials/project link are supplied: wrong passcode rejects, correct passcode admits, seeded central data is visible from a second device/browser.
