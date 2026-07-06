import { describe, expect, it } from "vitest";
import { isDue, sm2Next, type ReviewState } from "@/lib/engine/sm2";

const today = "2026-07-06";

function state(overrides: Partial<ReviewState> = {}): ReviewState {
  return {
    nextReviewAt: today,
    intervalDays: 0,
    easeFactor: 2.5,
    repetitions: 0,
    ...overrides,
  };
}

describe("sm2Next examples [US2-AC1..7, FR-011, FR-013, FR-018, SC-003]", () => {
  it("US2-AC2: canonical correct review sequence is 1d -> 6d -> round(prev x EF)", () => {
    const first = sm2Next(state(), "correct", "review", today);
    expect(first.state.intervalDays).toBe(1);
    expect(first.state.nextReviewAt).toBe("2026-07-07");

    const second = sm2Next(first.state, "correct", "review", "2026-07-07");
    expect(second.state.intervalDays).toBe(6);
    expect(second.state.nextReviewAt).toBe("2026-07-13");

    const third = sm2Next(second.state, "correct", "review", "2026-07-13");
    expect(third.state.intervalDays).toBe(Math.round(6 * second.state.easeFactor));
  });

  it("US2-AC3/AC6: incorrect answer resets interval and repetitions", () => {
    const result = sm2Next(
      state({ nextReviewAt: "2026-09-01", intervalDays: 40, easeFactor: 2.1, repetitions: 5 }),
      "incorrect",
      "exam",
      today,
    );

    expect(result.scheduleChanged).toBe(true);
    expect(result.state).toMatchObject({
      intervalDays: 1,
      nextReviewAt: "2026-07-07",
      repetitions: 0,
    });
  });

  it("US2-AC4: repeated hard and incorrect answers keep ease at the 1.3 floor", () => {
    let current = state({ intervalDays: 12, easeFactor: 1.31, repetitions: 3 });
    current = sm2Next(current, "hard", "review", today).state;
    current = sm2Next(current, "incorrect", "review", today).state;

    expect(current.easeFactor).toBe(1.3);
  });

  it("E6: hard answer shortens or keeps the current interval", () => {
    const current = state({ intervalDays: 10, easeFactor: 2.5, repetitions: 3 });
    const result = sm2Next(current, "hard", "review", today);

    expect(result.scheduleChanged).toBe(true);
    expect(result.state.intervalDays).toBeLessThanOrEqual(current.intervalDays);
    expect(result.state.nextReviewAt).toBe("2026-07-11");
  });

  it("US2-AC7: correct trainer/exam answer leaves a bank question schedule untouched", () => {
    const current = state({ nextReviewAt: "2026-08-10", intervalDays: 20, easeFactor: 2.3, repetitions: 4 });

    expect(sm2Next(current, "correct", "trainer", today)).toEqual({
      state: current,
      scheduleChanged: false,
    });
    expect(sm2Next(current, "correct", "exam", today)).toEqual({
      state: current,
      scheduleChanged: false,
    });
  });

  it("SC-003: isDue is true exactly when nextReviewAt <= today", () => {
    expect(isDue(state({ nextReviewAt: "2026-07-05" }), today)).toBe(true);
    expect(isDue(state({ nextReviewAt: "2026-07-06" }), today)).toBe(true);
    expect(isDue(state({ nextReviewAt: "2026-07-07" }), today)).toBe(false);
  });
});
