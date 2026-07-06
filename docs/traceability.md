# Traceability Matrix

Feature: `001-study-app-mvp`  
Updated: 2026-07-06

## Acceptance Criteria

| Requirement | Coverage |
| --- | --- |
| US1-AC1 PDF upload creates topic library document | `tests/integration/api/documents.test.ts::POST /api/documents [FR-001, US1-AC1]`, `e2e/us1-library.spec.ts::full journey...` |
| US1-AC2 paginated PDF viewer with navigation/zoom | `tests/a11y/viewer.test.tsx::Library viewer UI [FR-002, US1-AC2, FR-028]`, `e2e/us1-library.spec.ts::full journey...` |
| US1-AC3 assistant opens as overlay without leaving viewer | `tests/a11y/assistant.test.tsx::opens as a dialog over the viewer without replacing the viewer route`, `e2e/us1-library.spec.ts::full journey...` |
| US1-AC4 answer includes grounded citation | `tests/integration/api/assistant.test.ts::returns a grounded answer with a page citation on success`, `e2e/us1-library.spec.ts::full journey...` |
| US1-AC5 citation jump navigates viewer | `tests/a11y/assistant.test.tsx::jumps the viewer to the cited page...`, `e2e/us1-library.spec.ts::full journey...` |
| US1-AC6 unanswerable question is refused | `tests/integration/api/assistant.test.ts::returns the explicit FR-007 refusal...`, `tests/integration/api/assistant-citation-set.test.ts::SC-002...`, `e2e/us1-library.spec.ts::full journey...` |
| US1-AC7 primary AI failure falls back locally | `tests/unit/ai/fallback.test.ts::askWithFallback [FR-008, FR-030, US1-AC7, US1-AC8]`, `tests/integration/api/assistant.test.ts::returns 502...`, `e2e/us1-library.spec.ts::full journey...` |
| US1-AC8 double failure preserves question for retry | `tests/integration/api/messages.test.ts::preserves a double-failure user question...`, `tests/a11y/assistant.test.tsx::shows engine disclosure and a preserved retry state...`, `e2e/us1-library.spec.ts::full journey...` |
| US2-AC1 new flashcard is due on creation day | `tests/integration/api/flashcards.test.ts::creates a flashcard due on its creation day...`, `tests/property/engine/sm2.property.test.ts::US2-AC1/FR-011...`, `e2e/us2-review.spec.ts::quickstart scenario 2...` |
| US2-AC2 correct review never decreases interval | `tests/property/engine/sm2.property.test.ts::US2-AC2...`, `tests/unit/engine/sm2.test.ts::US2-AC2...`, `tests/integration/api/review.test.ts::advances a flashcard schedule...` |
| US2-AC3 incorrect review resets to short interval | `tests/property/engine/sm2.property.test.ts::US2-AC3/AC6...`, `tests/unit/engine/sm2.test.ts::US2-AC3/AC6...`, `tests/integration/api/review.test.ts::overrides a future bank-question schedule...` |
| US2-AC4 ease factor floor | `tests/property/engine/sm2.property.test.ts::US2-AC4...`, `tests/unit/engine/sm2.test.ts::US2-AC4...` |
| US2-AC5 due queue/counts by item type | `tests/integration/api/review.test.ts::GET /api/review/due [FR-014, US2-AC5, SC-003]`, `tests/integration/api/courses.test.ts::GET /api/courses [FR-014]...`, `tests/a11y/review.test.tsx::renders dashboard counts...` |
| US2-AC6 incorrect bank question override in any context | `tests/integration/api/review.test.ts::overrides a future bank-question schedule...`, `tests/integration/api/trainer.test.ts::marks an incorrect answer...`, `tests/integration/api/exam.test.ts::is idempotent and applies SM-2 priority-review overrides...` |
| US2-AC7 correct Trainer/Exam bank question does not alter schedule | `tests/property/engine/sm2.property.test.ts::US2-AC7...`, `tests/unit/engine/sm2.test.ts::US2-AC7...`, `tests/integration/api/trainer.test.ts::returns immediate correct feedback without changing...`, `tests/integration/api/exam.test.ts::is idempotent...` |
| US3-AC1 create/edit bank questions manually | `tests/integration/api/bank-questions.test.ts::POST/PATCH/DELETE /api/bank-questions [FR-031, US3-AC1]`, `tests/a11y/trainer.test.tsx::lets a student edit a bank question manually` |
| US3-AC2 start trainer session from scoped bank | `tests/integration/api/trainer.test.ts::POST /api/trainer/sessions [FR-015, FR-016, US3-AC2]`, `e2e/us3-trainer.spec.ts::quickstart scenario 3...` |
| US3-AC3 trainer has no time limit | `tests/a11y/trainer.test.tsx::shows immediate feedback...without timer controls`, `e2e/us3-trainer.spec.ts::quickstart scenario 3...` |
| US3-AC4 immediate feedback before advance | `tests/integration/api/trainer.test.ts::POST /api/trainer/sessions/:id/answers...`, `tests/a11y/trainer.test.tsx::shows immediate feedback...`, `e2e/us3-trainer.spec.ts::quickstart scenario 3...` |
| US3-AC5 failed trainer question becomes priority review | `tests/integration/api/trainer.test.ts::marks an incorrect answer for priority review...`, `e2e/us3-trainer.spec.ts::quickstart scenario 3...` |
| US4-AC1 configure timed exam scoped to topic | `tests/integration/api/exam.test.ts::POST /api/exam/sessions [FR-019, US4-AC1]`, `tests/a11y/exam.test.tsx::renders duration configuration controls`, `e2e/us4-exam.spec.ts::quickstart scenario 4...` |
| US4-AC2 expiry stops and grades answered questions | `tests/property/scoring/timer.property.test.ts::exam timer properties...`, `tests/property/scoring/grade.property.test.ts::gradeExam properties...`, `tests/integration/api/exam.test.ts::GET /api/exam/sessions/:id...auto-finalizes...` |
| US4-AC3 score report with failed breakdown | `tests/unit/scoring/grade.test.ts::gradeExam examples...`, `tests/integration/api/exam.test.ts::POST /api/exam/sessions/:id/finalize...`, `tests/a11y/exam.test.tsx::renders the score report...` |
| US4-AC4 failed exam questions marked priority review | `tests/integration/api/exam.test.ts::is idempotent and applies SM-2 priority-review overrides...`, `e2e/us4-exam.spec.ts::quickstart scenario 4...` |
| US4-AC5 resume before expiry uses real elapsed time | `tests/property/scoring/timer.property.test.ts::resume equals...`, `tests/integration/api/exam.test.ts::returns a server-computed remainingMs for resume`, `e2e/us4-exam.spec.ts::quickstart scenario 4...` |
| US4-AC6 reopen after expiry shows graded report | `tests/integration/api/exam.test.ts::auto-finalizes when read after the deadline`, `e2e/us4-exam.spec.ts::quickstart scenario 4...` |
| US5-AC1 explanation submission returns structured feedback | `tests/integration/api/feynman.test.ts::POST /api/feynman/submissions [US5-AC1]`, `tests/integration/api/feynman.test.ts::POST /api/feynman/submissions/:id/evaluate...`, `e2e/us5-feynman.spec.ts::quickstart scenario 5...` |
| US5-AC2 evaluation cites Library documents when available | `tests/integration/api/feynman.test.ts::persists a normalized Gemini evaluation...`, `tests/integration/api/feynman.test.ts::POST /api/feynman/retrieve...`, `tests/unit/ai/feynman-eval.test.ts::drops invalid citation pages...` |
| US5-AC3 Gemini failure falls back locally | `tests/unit/ai/feynman-fallback.test.ts::runFeynmanFallback [US5 Scenario B]`, `e2e/us5-feynman.spec.ts::quickstart scenario 5...` |
| US5-AC4 engine disclosure displayed | `tests/a11y/feynman.test.tsx::submits an explanation and renders structured feedback with engine disclosure`, `e2e/us5-feynman.spec.ts::quickstart scenario 5...` |
| US5-AC5 double failure preserves explanation for retry | `tests/integration/api/feynman.test.ts::PATCH /api/feynman/submissions/:id/retry-state...`, `tests/a11y/feynman.test.tsx::preserves the explanation...`, `e2e/us5-feynman.spec.ts::quickstart scenario 5...` |

## Functional Requirements

| Requirement | Coverage |
| --- | --- |
| FR-001 PDF upload linked to topic Library | `tests/integration/api/documents.test.ts`, `e2e/us1-library.spec.ts` |
| FR-002 paginated viewer with navigation/zoom | `tests/a11y/viewer.test.tsx`, `e2e/us1-library.spec.ts` |
| FR-003 assistant overlay | `tests/a11y/assistant.test.tsx`, `e2e/us1-library.spec.ts` |
| FR-004 assistant answers only from document content | `tests/integration/api/assistant.test.ts::POST /api/assistant/retrieve [FR-004]`, `tests/integration/api/assistant.test.ts::POST /api/assistant/ask...` |
| FR-005 grounded answer page citation | `tests/integration/api/assistant.test.ts::returns a grounded answer...`, `tests/integration/api/assistant-citation-set.test.ts` |
| FR-006 citation tap navigates viewer | `tests/a11y/assistant.test.tsx::jumps the viewer...`, `e2e/us1-library.spec.ts` |
| FR-007 unanswerable refusal | `tests/integration/api/assistant.test.ts::returns the explicit FR-007 refusal...`, `tests/integration/api/assistant-citation-set.test.ts` |
| FR-008 primary AI fallback | `tests/unit/ai/fallback.test.ts`, `tests/unit/ai/feynman-fallback.test.ts`, `e2e/us1-library.spec.ts`, `e2e/us5-feynman.spec.ts` |
| FR-009 course/topic organization | `tests/integration/api/courses.test.ts::GET/POST /api/courses [FR-009]`, `tests/integration/api/courses.test.ts::POST/PATCH/DELETE /api/topics [FR-009]`, `tests/a11y/review.test.tsx` |
| FR-010 flashcard creation | `tests/integration/api/flashcards.test.ts`, `e2e/us2-review.spec.ts` |
| FR-011 new flashcard due on creation date | `tests/integration/api/flashcards.test.ts`, `tests/property/engine/sm2.property.test.ts::US2-AC1/FR-011...` |
| FR-012 three review outcomes | `tests/a11y/review.test.tsx::reveals a card and offers correct/incorrect/hard...`, `tests/integration/api/review.test.ts` |
| FR-013 SM-2 recalculation invariants | `tests/property/engine/sm2.property.test.ts`, `tests/unit/engine/sm2.test.ts`, `tests/integration/api/review.test.ts` |
| FR-014 due counts by course/topic/type | `tests/integration/api/review.test.ts::GET /api/review/due...`, `tests/integration/api/courses.test.ts::GET /api/courses [FR-014]...`, `e2e/us2-review.spec.ts` |
| FR-015 start untimed trainer | `tests/integration/api/trainer.test.ts::POST /api/trainer/sessions...`, `e2e/us3-trainer.spec.ts` |
| FR-016 trainer draws bank questions and has no timer | `tests/integration/api/trainer.test.ts`, `tests/a11y/trainer.test.tsx`, `e2e/us3-trainer.spec.ts` |
| FR-017 immediate trainer feedback | `tests/integration/api/trainer.test.ts::POST /api/trainer/sessions/:id/answers...`, `tests/a11y/trainer.test.tsx` |
| FR-018 Bank Questions share scheduling engine and asymmetry | `tests/property/engine/sm2.property.test.ts`, `tests/integration/api/review.test.ts`, `tests/integration/api/trainer.test.ts`, `tests/integration/api/exam.test.ts` |
| FR-019 timed exam configuration | `tests/integration/api/exam.test.ts::POST /api/exam/sessions...`, `tests/a11y/exam.test.tsx`, `e2e/us4-exam.spec.ts` |
| FR-020 auto-stop/grade at time limit | `tests/property/scoring/timer.property.test.ts`, `tests/integration/api/exam.test.ts`, `e2e/us4-exam.spec.ts` |
| FR-021 score report | `tests/property/scoring/grade.property.test.ts`, `tests/integration/api/exam.test.ts::POST /api/exam/sessions/:id/finalize...`, `tests/a11y/exam.test.tsx` |
| FR-022 Feynman explanation submission | `tests/integration/api/feynman.test.ts::POST /api/feynman/submissions...`, `tests/a11y/feynman.test.tsx` |
| FR-023 structured Feynman evaluation | `tests/unit/ai/feynman-eval.test.ts`, `tests/integration/api/feynman.test.ts::POST /api/feynman/submissions/:id/evaluate...` |
| FR-024 grounded Feynman citations | `tests/integration/api/feynman.test.ts::POST /api/feynman/retrieve...`, `tests/unit/ai/feynman-eval.test.ts::drops invalid citation pages...` |
| FR-025 engine disclosure | `tests/a11y/feynman.test.tsx`, `e2e/us5-feynman.spec.ts` |
| FR-026 single local passcode, no account auth | `tests/integration/proxy.test.ts::proxy passcode gate (FR-026)` |
| FR-027 central persisted study data | `tests/integration/api/*.test.ts` persistence checks, post-deploy smoke checklist in `docs/quality-report.md` |
| FR-028 WCAG 2.1 AA | `tests/a11y/*.test.tsx`, `e2e/a11y-sweep.spec.ts::seeded app screens have no WCAG 2.1 A/AA violations` |
| FR-029 trainer/exam resume | `tests/integration/api/trainer.test.ts`, `tests/integration/api/exam.test.ts`, `e2e/us3-trainer.spec.ts::resumes...`, `e2e/us4-exam.spec.ts::quickstart scenario 4...` |
| FR-030 double-failure preservation | `tests/unit/ai/fallback.test.ts`, `tests/integration/api/messages.test.ts`, `tests/integration/api/feynman.test.ts::PATCH ... retry-state`, `e2e/us1-library.spec.ts`, `e2e/us5-feynman.spec.ts` |
| FR-031 manual Bank Question create/edit | `tests/integration/api/bank-questions.test.ts`, `tests/a11y/trainer.test.tsx::lets a student edit...` |

## Success Criteria

| Requirement | Coverage |
| --- | --- |
| SC-001 course to document assistant answer under 2 minutes | `e2e/us1-library.spec.ts::full journey...` |
| SC-002 20-question citation/refusal fixture at 100% | `tests/integration/api/assistant-citation-set.test.ts::SC-002...`, `e2e/us1-library.spec.ts::full journey...SC-002 UI acceptance` |
| SC-003 30-day due queue zero drift | `tests/property/engine/sm2.property.test.ts::SC-003: 30-day simulated due queue has zero drift`, `e2e/us2-review.spec.ts::quickstart scenario 2...` |
| SC-004 trainer complete session no dead ends | `e2e/us3-trainer.spec.ts::quickstart scenario 3...` |
| SC-005 exam report within 5 seconds | `e2e/us4-exam.spec.ts::quickstart scenario 4...renders report within 5 seconds` |
| SC-006 Feynman fallback returns structured evaluation with engine disclosure | `e2e/us5-feynman.spec.ts::quickstart scenario 5...`, `tests/unit/ai/feynman-fallback.test.ts` |
| SC-007 dashboard due counts in one screen by type | `tests/a11y/review.test.tsx::renders dashboard counts...`, `tests/integration/api/review.test.ts::GET /api/review/due...` |
| SC-008 automated accessibility zero critical violations | `e2e/a11y-sweep.spec.ts::seeded app screens have no WCAG 2.1 A/AA violations`, `tests/a11y/*.test.tsx` |

## Explicit Contracts

| Contract | Coverage |
| --- | --- |
| `today` is required on review APIs and never inferred from server date | `tests/integration/api/review.test.ts::requires today to keep the API deterministic`, `tests/integration/api/review.test.ts::GET /api/review/due...rejects missing today...` |
| Feynman explanation bound is 20,000 characters | `tests/integration/api/feynman.test.ts::creates a submitted explanation and rejects empty or too-long text`, `tests/a11y/feynman.test.tsx::renders topic selection...20k character guard` |
| Scenario-B Feynman grounding never invents citations when cached chunks are absent | `tests/unit/ai/feynman-fallback.test.ts::does not run ungrounded local evaluation...`, `tests/unit/ai/feynman-fallback.test.ts::drops local fallback citations...` |
