import "@testing-library/jest-dom/vitest";
import { afterEach, expect } from "vitest";
import { cleanup } from "@testing-library/react";
// vitest-axe@0.1.0's own "vitest-axe/extend-expect" entry point ships as an
// empty file, and its "vitest-axe/matchers" shim re-exports the matcher as
// `export type *` (a packaging bug that erases it as a value for TS) even
// though the runtime export is real — importing the dist file directly
// dodges both issues. Register the matcher against vitest's `expect` here.
import { toHaveNoViolations } from "vitest-axe/dist/matchers.js";
expect.extend({ toHaveNoViolations });

// RTL's automatic cleanup registration only fires when `afterEach` is a
// global; this project doesn't set `test.globals`, so register explicitly.
afterEach(cleanup);
