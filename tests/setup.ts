import { afterAll, afterEach, beforeAll } from "vitest";
import { setupServer } from "msw/node";

// Shared MSW server for integration tests that simulate Gemini
// timeout/quota/network failures (Principle V). Individual tests call
// `server.use(...)` to install request handlers for the case under test.
export const server = setupServer();

beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());
