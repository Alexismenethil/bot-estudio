export type Outcome = "correct" | "incorrect" | "hard";
export type ReviewContext = "review" | "trainer" | "exam";

export interface ReviewState {
  nextReviewAt: string;
  intervalDays: number;
  easeFactor: number;
  repetitions: number;
}

export interface Sm2Result {
  state: ReviewState;
  scheduleChanged: boolean;
}

const MIN_EASE_FACTOR = 1.3;

function addDays(date: string, days: number): string {
  const value = new Date(`${date}T00:00:00.000Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

function clampEase(value: number): number {
  return Math.max(MIN_EASE_FACTOR, Number(value.toFixed(2)));
}

function withInterval(state: ReviewState, intervalDays: number, today: string): ReviewState {
  return {
    ...state,
    intervalDays,
    nextReviewAt: addDays(today, intervalDays),
  };
}

function correctReview(state: ReviewState, today: string): ReviewState {
  const repetitions = state.repetitions + 1;
  let intervalDays: number;

  if (repetitions === 1) {
    intervalDays = Math.max(1, state.intervalDays);
  } else if (repetitions === 2) {
    intervalDays = Math.max(6, state.intervalDays);
  } else {
    intervalDays = Math.max(state.intervalDays, Math.round(state.intervalDays * state.easeFactor));
  }

  return {
    ...withInterval(state, intervalDays, today),
    easeFactor: clampEase(state.easeFactor + 0.1),
    repetitions,
  };
}

function incorrect(state: ReviewState, today: string): ReviewState {
  return {
    ...withInterval(state, 1, today),
    easeFactor: clampEase(state.easeFactor - 0.2),
    repetitions: 0,
  };
}

function hard(state: ReviewState, today: string): ReviewState {
  const intervalDays = state.intervalDays === 0 ? 0 : Math.max(1, Math.floor(state.intervalDays / 2));
  return {
    ...withInterval(state, intervalDays, today),
    easeFactor: clampEase(state.easeFactor - 0.15),
  };
}

export function sm2Next(
  state: ReviewState,
  outcome: Outcome,
  context: ReviewContext,
  today: string,
): Sm2Result {
  if ((context === "trainer" || context === "exam") && outcome === "correct") {
    return { state, scheduleChanged: false };
  }

  if (outcome === "incorrect") {
    return { state: incorrect(state, today), scheduleChanged: true };
  }

  if (outcome === "hard") {
    return { state: hard(state, today), scheduleChanged: true };
  }

  return { state: correctReview(state, today), scheduleChanged: true };
}

export function isDue(state: ReviewState, today: string): boolean {
  return state.nextReviewAt <= today;
}

export function dueItems<T extends { state: ReviewState }>(items: T[], today: string): T[] {
  return items.filter((item) => isDue(item.state, today));
}
