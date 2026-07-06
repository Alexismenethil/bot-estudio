import { describe, expect, it } from "vitest";
import fc from "fast-check";
import { isExpired, remainingMs } from "@/lib/scoring/timer";

describe("exam timer properties [FR-020, FR-029, US4-AC5, US4-AC6]", () => {
  it("remainingMs is always clamped at or above zero", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 4_000_000_000_000 }),
        fc.integer({ min: 1, max: 24 * 60 * 60 }),
        fc.integer({ min: 0, max: 48 * 60 * 60 * 1000 }),
        (startedAt, durationSec, elapsedMs) => {
          expect(remainingMs(startedAt, durationSec, startedAt + elapsedMs)).toBeGreaterThanOrEqual(0);
        },
      ),
    );
  });

  it("remainingMs is monotone non-increasing as now moves forward", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 4_000_000_000_000 }),
        fc.integer({ min: 1, max: 24 * 60 * 60 }),
        fc.integer({ min: 0, max: 24 * 60 * 60 * 1000 }),
        fc.integer({ min: 0, max: 24 * 60 * 60 * 1000 }),
        (startedAt, durationSec, firstElapsed, extraElapsed) => {
          const first = startedAt + firstElapsed;
          const second = first + extraElapsed;
          expect(remainingMs(startedAt, durationSec, second)).toBeLessThanOrEqual(
            remainingMs(startedAt, durationSec, first),
          );
        },
      ),
    );
  });

  it("isExpired is equivalent to remainingMs being zero", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 4_000_000_000_000 }),
        fc.integer({ min: 1, max: 24 * 60 * 60 }),
        fc.integer({ min: 0, max: 48 * 60 * 60 * 1000 }),
        (startedAt, durationSec, elapsedMs) => {
          const now = startedAt + elapsedMs;
          expect(isExpired(startedAt, durationSec, now)).toBe(
            remainingMs(startedAt, durationSec, now) === 0,
          );
        },
      ),
    );
  });

  it("resume equals the configured duration minus real elapsed time", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 4_000_000_000_000 }),
        fc.integer({ min: 1, max: 24 * 60 * 60 }),
        fc.integer({ min: 0, max: 48 * 60 * 60 * 1000 }),
        (startedAt, durationSec, elapsedMs) => {
          const expected = Math.max(0, durationSec * 1000 - elapsedMs);
          expect(remainingMs(startedAt, durationSec, startedAt + elapsedMs)).toBe(expected);
        },
      ),
    );
  });
});
