import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "node:path";

const alias = { "@": path.resolve(__dirname, "./src") };

export default defineConfig({
  test: {
    projects: [
      {
        resolve: { alias },
        test: {
          name: "unit",
          environment: "node",
          include: ["tests/unit/**/*.test.ts"],
        },
      },
      {
        resolve: { alias },
        test: {
          name: "property",
          environment: "node",
          include: ["tests/property/**/*.test.ts"],
        },
      },
      {
        resolve: { alias },
        test: {
          name: "integration",
          environment: "node",
          include: ["tests/integration/**/*.test.ts"],
          setupFiles: ["./tests/setup.ts"],
          // PGlite (WASM Postgres + pgvector, see tests/helpers/pglite.ts) can be
          // slow to boot per-file; keep integration tests single-threaded to avoid
          // spawning many WASM instances at once.
          pool: "forks",
          fileParallelism: false,
        },
      },
      {
        resolve: { alias },
        plugins: [react()],
        test: {
          name: "a11y",
          environment: "jsdom",
          include: ["tests/a11y/**/*.test.tsx"],
          setupFiles: ["./tests/setup.a11y.ts"],
        },
      },
    ],
  },
});
