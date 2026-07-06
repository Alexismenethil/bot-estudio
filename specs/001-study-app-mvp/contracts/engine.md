# Pure-Function Contracts (constitution-gated logic)

**Feature**: `001-study-app-mvp` | **Date**: 2026-07-05

These modules are the Stryker mutation targets (≥80%, Principle II) and fast-check
property subjects (Principle III). They perform no I/O; all inputs, including "now",
are parameters. Test names MUST embed the AC/FR ids listed per invariant
(Principle IV).

---

## 1. SM-2 engine — `src/lib/engine/sm2.ts`

```ts
type Outcome = 'correct' | 'incorrect' | 'hard'
type ReviewContext = 'review' | 'trainer' | 'exam'

interface ReviewState {
  nextReviewAt: string   // ISO date
  intervalDays: number   // ≥ 0
  easeFactor: number     // ≥ 1.3
  repetitions: number    // ≥ 0
}

function sm2Next(
  state: ReviewState,
  outcome: Outcome,
  context: ReviewContext,
  today: string          // ISO date, injected — never Date.now() inside
): { state: ReviewState; scheduleChanged: boolean }
```

Invariants (each maps to a traceable requirement):

| # | Invariant | Traces to |
|---|-----------|-----------|
| E1 | `context='review'`, `outcome='correct'` ⇒ `intervalDays' ≥ intervalDays` (never decreases) | FR-013, US2-AC2 |
| E2 | `outcome='incorrect'` (any context) ⇒ interval resets to 1 day and `nextReviewAt' ≥ today` (never negative/past) | FR-013, US2-AC3, US2-AC6 |
| E3 | For all inputs: `easeFactor' ≥ 1.3` | FR-013, US2-AC4 |
| E4 | `context∈{trainer,exam}`, `outcome='correct'` ⇒ state unchanged, `scheduleChanged=false` (asymmetry) | FR-018, US2-AC7 |
| E5 | `context∈{trainer,exam}`, `outcome='incorrect'` ⇒ identical result to `context='review'`, `outcome='incorrect'` (override, no separate mechanism) | FR-018, US2-AC6 |
| E6 | `outcome='hard'` ⇒ `intervalDays' ≤ intervalDays`, ease may decrease but E3 holds | spec assumption (SM-2 model) |
| E7 | New item default state (`intervalDays=0`, `nextReviewAt=creationDate`) is due on creation day | FR-011, US2-AC1 |
| E8 | Determinism: same (state, outcome, context, today) ⇒ same output | SC-003 (zero drift) |

`isDue(state, today): boolean` ⇔ `state.nextReviewAt ≤ today` — the ONLY due-ness
predicate used anywhere (SC-003).

## 2. Exam scoring — `src/lib/scoring/grade.ts`

```ts
interface GradedExam {
  totalQuestions: number
  answeredCount: number
  correctCount: number
  scorePct: number              // 0–100
  failed: { questionId: string; topicId: string }[]
}

function gradeExam(
  questionIds: string[],                       // frozen draw
  answers: { questionId: string; isCorrect: boolean }[],
  topicByQuestion: Record<string, string>
): GradedExam
```

Invariants: `0 ≤ correctCount ≤ answeredCount ≤ totalQuestions` ·
`scorePct = correctCount / totalQuestions × 100` (unanswered count as wrong —
"grades whatever was answered", FR-020, US4-AC2) · `failed` = wrong + unanswered ·
duplicate answers for one question are impossible by input contract (UNIQUE
constraint) and rejected if present. Traces to FR-020, FR-021, US4-AC2/3, SC-005.

## 3. Timer math — `src/lib/scoring/timer.ts`

```ts
function remainingMs(startedAt: number, durationSec: number, now: number): number
function isExpired(startedAt: number, durationSec: number, now: number): boolean
```

Invariants: `remainingMs ≥ 0` always (clamped) · monotonically non-increasing in
`now` · `isExpired ⇔ remainingMs = 0` · resume after absence reflects real elapsed
time (pure function of wall clocks — no pause states exist). Traces to FR-020,
FR-029, US4-AC5/6.

## 4. Feynman evaluation normalizer — `src/lib/ai/feynman-eval.ts`

```ts
interface FeynmanEvaluation {
  correctPoints: string[]
  missingPoints: string[]
  wrongPoints: string[]
  reviewSuggestions: string[]
  citations: { documentId: string; page: number }[]
}

function normalizeEvaluation(raw: unknown): FeynmanEvaluation | { error: 'invalid_response' }
```

Invariants: never throws · engine-agnostic (same normalizer for Gemini JSON and
local-model output — FR-023/FR-025 contract independence) · citation pages must be
positive integers or the citation is dropped (never invented — FR-024) · an
`invalid_response` result is treated by the caller as that engine's failure (feeds
the fallback chain). Traces to FR-023, FR-024, US5-AC1/2.

## 5. Failure classification & fallback decision — `src/lib/ai/fallback.ts`

```ts
type FailureClass =
  | 'timeout' | 'quota' | 'network'            // Gemini modes (Principle V)
  | 'unsupported' | 'oom' | 'not_cached' | 'inference_error' | 'invalid_response'

function classifyGeminiError(e: unknown): 'timeout' | 'quota' | 'network' | 'invalid_response'

type ChainResult<T> =
  | { ok: true; value: T; engine: 'gemini' | 'local' }
  | { ok: false; state: 'unavailable' }        // → FR-030 UI, input preserved

async function askWithFallback<T>(
  gemini: () => Promise<T>,
  local: () => Promise<T>,
  log: (event: FallbackEvent) => void
): Promise<ChainResult<T>>
```

Invariants: Gemini attempted first; ANY of {timeout, quota, network,
invalid_response} ⇒ local attempted; ANY local failure class ⇒
`{ok:false,'unavailable'}` — never a thrown exception reaching UI · result always
discloses `engine` (FR-025, US1-AC7, US5-AC4) · every transition emits exactly one
structured log event with `expected_degradation: true` for fallbacks vs `false` for
double failure (Principle VIII). Traces to FR-008, FR-030, US1-AC7/8, US5-AC3/5,
SC-006. The decision logic (not the network calls) is in the Stryker scope via its
pure reducer `nextChainState(state, event)`.
