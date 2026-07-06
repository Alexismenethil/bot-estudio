import type { EngineName, FailureClass } from "@/lib/ai/types";

export type LogLevel = "info" | "warn" | "error";

export interface LogEvent {
  boundary: string;
  message: string;
  level?: LogLevel;
  engine?: EngineName;
  failure_class?: FailureClass;
  expected_degradation?: boolean;
  latency_ms?: number;
  [key: string]: unknown;
}

// Structured JSON logger for every I/O boundary (AI calls, DB writes, timer
// grading — constitution Principle VIII). Expected-fallback logs
// (`expected_degradation: true`) must stay distinguishable from real defects.
export function logEvent(event: LogEvent): void {
  const level = event.level ?? "info";
  const record = { timestamp: new Date().toISOString(), ...event, level };
  const line = JSON.stringify(record);

  if (level === "error") {
    console.error(line);
  } else if (level === "warn") {
    console.warn(line);
  } else {
    console.log(line);
  }
}
