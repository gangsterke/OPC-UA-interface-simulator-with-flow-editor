export type StepOutcome = "pass" | "fail" | "error" | "skipped" | "cancelled";

export interface StepResult {
  stepId: string;
  kind: string;
  outcome: StepOutcome;
  startedAt: string;
  finishedAt: string;
  durationMs: number;
  actualValue?: string | number | boolean | null;
  expectedValue?: string | number | boolean | null;
  message?: string;
}

export interface RunSummary {
  runId: string;
  outcome: "passed" | "failed" | "cancelled";
  startedAt: string;
  finishedAt: string;
  stepResults: StepResult[];
}

export interface RunLogLine {
  level: "info" | "warn" | "error";
  message: string;
  timestamp: string;
}
