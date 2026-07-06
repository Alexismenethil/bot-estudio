export function remainingMs(startedAt: number, durationSec: number, now: number): number {
  const durationMs = Math.max(0, durationSec) * 1000;
  return Math.max(0, startedAt + durationMs - now);
}

export function isExpired(startedAt: number, durationSec: number, now: number): boolean {
  return remainingMs(startedAt, durationSec, now) === 0;
}
