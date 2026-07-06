import { defineConfig, devices } from "@playwright/test";

const e2ePort = Number(process.env.PLAYWRIGHT_PORT ?? 3100);
const baseURL = `http://localhost:${e2ePort}`;

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: "html",
  use: {
    baseURL,
    trace: "on-first-retry",
  },
  // Mobile-first constitution requirement (Principle VI): the primary project
  // is a mid-range mobile viewport; desktop is a secondary check.
  projects: [
    { name: "mobile-chrome", use: { ...devices["Pixel 7"] } },
    { name: "desktop-chromium", use: { ...devices["Desktop Chrome"] } },
  ],
  webServer: {
    command: `pnpm exec next dev -p ${e2ePort}`,
    url: baseURL,
    reuseExistingServer: !process.env.CI,
    env: {
      ...process.env,
      APP_PASSCODE: process.env.APP_PASSCODE ?? "test-passcode",
      SESSION_SECRET: process.env.SESSION_SECRET ?? "a".repeat(32),
    },
  },
});
