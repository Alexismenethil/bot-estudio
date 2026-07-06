import { describe, expect, it } from "vitest";
import fc from "fast-check";
import { dueItems, isDue, sm2Next, type Outcome, type ReviewContext, type ReviewState } from "@/lib/engine/sm2";

const baseDate = "2026-07-06";

function addDays(date: string, days: number): string {
  const value = new Date(`${date}T00:00:00.000Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

const stateArbitrary = fc.record({
  nextReviewAt: fc.integer({ min: -30, max: 30 }).map((offset) => addDays(baseDate, offset)),
  intervalDays: fc.integer({ min: 0, max: 365 }),
  easeFactor: fc.double({ min: 1.3, max: 4, noNaN: true, noDefaultInfinity: true }),
  repetitions: fc.integer({ min: 0, max: 20 }),
});

const outcomeArbitrary = fc.constantFrom<Outcome>("correct", "incorrect", "hard");
const contextArbitrary = fc.constantFrom<ReviewContext>("review", "trainer", "exam");

describe("sm2Next properties [US2-AC1..7, FR-011, FR-013, FR-018, SC-003]", () => {
  it("US2-AC2: correct in review never decreases interval", () => {
    fc.assert(
      fc.property(stateArbitrary, (state) => {
        const result = sm2Next(state, "correct", "review", baseDate);
        expect(result.state.intervalDays).toBeGreaterThanOrEqual(state.intervalDays);
        expect(result.scheduleChanged).toBe(true);
      }),
    );
  });

  it("US2-AC3/AC6: incorrect resets to 1 day and never schedules in the past", () => {
    fc.assert(
      fc.property(stateArbitrary, contextArbitrary, (state, context) => {
        const result = sm2Next(state, "incorrect", context, baseDate);
        expect(result.state.intervalDays).toBe(1);
        expect(result.state.nextReviewAt >= baseDate).toBe(true);
        expect(result.scheduleChanged).toBe(true);
      }),
    );
  });

  it("US2-AC4: ease >= 1.3 always", () => {
    fc.assert(
      fc.property(stateArbitrary, outcomeArbitrary, contextArbitrary, (state, outcome, context) => {
        const result = sm2Next(state, outcome, context, baseDate);
        expect(result.state.easeFactor).toBeGreaterThanOrEqual(1.3);
      }),
    );
  });

  it("US2-AC7: trainer/exam-correct is a no-op", () => {
    fc.assert(
      fc.property(stateArbitrary, fc.constantFrom<ReviewContext>("trainer", "exam"), (state, context) => {
        const result = sm2Next(state, "correct", context, baseDate);
        expect(result.state).toEqual(state);
        expect(result.scheduleChanged).toBe(false);
      }),
    );
  });

  it("US2-AC1/FR-011: new item due on creation day", () => {
    const newState: ReviewState = {
      nextReviewAt: baseDate,
      intervalDays: 0,
      easeFactor: 2.5,
      repetitions: 0,
    };

    expect(isDue(newState, baseDate)).toBe(true);
  });

  it("SC-003: same input always produces the same output", () => {
    fc.assert(
      fc.property(stateArbitrary, outcomeArbitrary, contextArbitrary, (state, outcome, context) => {
        expect(sm2Next(state, outcome, context, baseDate)).toEqual(
          sm2Next(state, outcome, context, baseDate),
        );
      }),
    );
  });

  it("SC-003: 30-day simulated due queue has zero drift", () => {
    const itemArbitrary = fc.record({
      id: fc.uuid(),
      state: stateArbitrary.map((state) => ({ ...state, nextReviewAt: addDays(baseDate, 0) })),
      outcomes: fc.array(outcomeArbitrary, { minLength: 30, maxLength: 30 }),
    });

    fc.assert(
      fc.property(fc.array(itemArbitrary, { minLength: 5, maxLength: 8 }), (items) => {
        let currentItems = items;

        for (let day = 0; day < 30; day++) {
          const today = addDays(baseDate, day);
          const expectedIds = currentItems
            .filter((item) => item.state.nextReviewAt <= today)
            .map((item) => item.id)
            .sort();
          const actualIds = dueItems(currentItems, today)
            .map((item) => item.id)
            .sort();

          expect(actualIds).toEqual(expectedIds);

          currentItems = currentItems.map((item) => {
            if (!isDue(item.state, today)) {
              return item;
            }
            return {
              ...item,
              state: sm2Next(item.state, item.outcomes[day]!, "review", today).state,
            };
          });
        }
      }),
    );
  });
});
