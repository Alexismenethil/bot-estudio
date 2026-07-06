// vitest-axe@0.1.0 ships no ambient typing for its custom matcher against
// Vitest's `expect` (see tests/setup.a11y.ts for the runtime registration).
import "vitest";

interface AxeMatchers<R = unknown> {
  toHaveNoViolations(): R;
}

declare module "vitest" {
  // eslint-disable-next-line @typescript-eslint/no-empty-object-type -- declaration merging
  interface Assertion<T = unknown> extends AxeMatchers<T> {}
  // eslint-disable-next-line @typescript-eslint/no-empty-object-type -- declaration merging
  interface AsymmetricMatchersContaining extends AxeMatchers {}
}
