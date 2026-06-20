export type TagLiteralValue =
  | { type: "boolean"; value: boolean }
  | { type: "number"; value: number }
  | { type: "string"; value: string }
  // 64-bit ints need string-backed representation to avoid JS number precision loss.
  | { type: "int64"; value: string };

interface SequenceStepBase {
  id: string;
  label?: string;
  enabled: boolean;
}

export interface WriteStep extends SequenceStepBase {
  kind: "write";
  tagId: string | null;
  value: TagLiteralValue;
}

export type Comparison = "equals" | "notEquals" | "tolerance" | "greaterThan" | "lessThan";
export type ToleranceMode = "absolute" | "percent";
export type OnTimeout = "fail" | "failAndContinue";
export type ConditionCombinator = "AND" | "OR";

// A single check: tagId's live value, compared against either a typed-in
// constant or another tag's live value (expectedSource discriminates which).
export interface WaitCondition {
  tagId: string | null;
  comparison: Comparison;
  expectedSource: "constant" | "tag";
  expectedValue: TagLiteralValue; // used when expectedSource === "constant"
  expectedTagId: string | null; // used when expectedSource === "tag"
  tolerance?: number;
  toleranceMode?: ToleranceMode;
}

export interface WaitAssertStep extends SequenceStepBase {
  kind: "waitAssert";
  conditionA: WaitCondition;
  // null = single-condition mode; set to check a second condition combined
  // with conditionA via `combinator`.
  conditionB: WaitCondition | null;
  combinator: ConditionCombinator;
  // null = wait indefinitely until the condition is met or the run is cancelled.
  timeoutMs: number | null;
  pollIntervalMs: number;
  onTimeout: OnTimeout;
}

export interface DelayStep extends SequenceStepBase {
  kind: "delay";
  durationMs: number;
}

// Extensibility is the point of this union: a future step kind is one new
// variant + one new executor + one new card, no existing branches touched
// (TypeScript's exhaustiveness checking on `kind` flags any switch that
// misses a case).
export type SequenceStep = WriteStep | WaitAssertStep | DelayStep;
