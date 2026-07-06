import { classifyGeminiError } from "./gemini";
import { classifyLocalError } from "./types";
import type { EngineName, FailureClass } from "./types";

export type ChainEvent =
  | { type: "gemini_failure"; failureClass: FailureClass }
  | { type: "local_failure"; failureClass: FailureClass };

// Pure decision reducer (Stryker/mutation-tested target, contracts/engine.md
// §5): ANY Gemini failure class routes to local; ANY local failure class
// routes to the terminal FR-030 state. The specific class only matters for
// logging, never for the routing decision itself.
export function nextChainState(event: ChainEvent): "try_local" | "unavailable" {
  return event.type === "gemini_failure" ? "try_local" : "unavailable";
}

export type ChainResult<T> =
  | { ok: true; value: T; engine: EngineName }
  | { ok: false; state: "unavailable" };

export interface FallbackLogEvent {
  engine: EngineName;
  failureClass?: FailureClass;
  expectedDegradation: boolean;
}

export async function askWithFallback<T>(
  gemini: () => Promise<T>,
  local: () => Promise<T>,
  log: (event: FallbackLogEvent) => void,
): Promise<ChainResult<T>> {
  try {
    const value = await gemini();
    log({ engine: "gemini", expectedDegradation: false });
    return { ok: true, value, engine: "gemini" };
  } catch (geminiError) {
    const geminiFailureClass = classifyGeminiError(geminiError);
    log({ engine: "gemini", failureClass: geminiFailureClass, expectedDegradation: true });
    nextChainState({ type: "gemini_failure", failureClass: geminiFailureClass });

    try {
      const value = await local();
      log({ engine: "local", expectedDegradation: true });
      return { ok: true, value, engine: "local" };
    } catch (localError) {
      const localFailureClass = classifyLocalError(localError);
      log({ engine: "local", failureClass: localFailureClass, expectedDegradation: false });
      nextChainState({ type: "local_failure", failureClass: localFailureClass });
      return { ok: false, state: "unavailable" };
    }
  }
}
