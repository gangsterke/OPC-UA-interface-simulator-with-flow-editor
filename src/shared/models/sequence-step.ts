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
  value: ValueSource;
}

// "changed" has no expected value - it captures the tag's value on the
// step's first poll and succeeds once a later poll differs from that
// baseline. Models "the PLC incremented a sequence-number tag" without the
// caller needing to know what value to expect in advance.
export type Comparison = "equals" | "notEquals" | "tolerance" | "greaterThan" | "lessThan" | "changed";
export type ToleranceMode = "absolute" | "percent";
export type OnTimeout = "fail" | "failAndContinue";
export type ConditionCombinator = "AND" | "OR";

// The subject of a WaitCondition when subjectSource === "method": the
// method is re-invoked on every poll (just like a tag is re-read on every
// poll) and methodOutputIndex picks which declared output becomes the
// polled value - e.g. "wait until getMachineSpeed() returns >= 100" with no
// tag involved at all. methodInputArguments mirrors CallMethodStep's input
// arguments, one ValueSource per declared input.
export interface MethodCallSubject {
  methodId: string | null;
  methodOutputIndex: number;
  methodInputArguments: ValueSource[];
}

// A single check: a subject's live value (a tag's, or a method call's
// output - subjectSource discriminates which), compared against a typed-in
// constant, another tag's live value, or a prior CallMethodStep's captured
// output (expectedSource discriminates which).
export interface WaitCondition {
  subjectSource: "tag" | "method";
  tagId: string | null; // used when subjectSource === "tag"
  methodSubject: MethodCallSubject; // used when subjectSource === "method"
  comparison: Comparison;
  expectedSource: "constant" | "tag" | "stepOutput";
  expectedValue: TagLiteralValue; // used when expectedSource === "constant"
  expectedTagId: string | null; // used when expectedSource === "tag"
  expectedStepOutput: StepOutputRef | null; // used when expectedSource === "stepOutput"
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

// A reference to a prior CallMethodStep's captured output, used by the
// "stepOutput" source variant below. outputIndex indexes into that step's
// outputArguments; fieldPath optionally drills into a structured
// (ExtensionObject) output by field name, e.g. ["chamberState", "actValue"].
// [] means "use the captured output value itself" - the whole-output
// passthrough the PLC-requester pattern needs (feeding a structured
// "envelope" output straight back in as another method's input of the same
// structured type, with no re-typing).
export interface StepOutputRef {
  stepId: string | null;
  outputIndex: number;
  fieldPath: string[];
}

// Generalizes the tag-vs-constant pattern with a third option: a prior
// CallMethodStep's captured output (see StepOutputRef). Used for both
// CallMethodStep's input arguments and WriteStep's value. The "tag" variant's
// fieldPath mirrors stepOutput's: [] uses the tag's live value as-is, a
// non-empty path drills into a structured/array tag value by field name or
// array index (e.g. ["3", "value"] for "the 4th array element's value
// field") - needed for tags like an "Alarms" array-of-structs tag, where you
// want one specific alarm's field rather than the whole array.
export type ValueSource =
  | { source: "constant"; value: TagLiteralValue }
  | { source: "tag"; tagId: string | null; fieldPath: string[] }
  | ({ source: "stepOutput" } & StepOutputRef);

// Kept as a separate name for call sites written against method arguments
// specifically; identical type underneath.
export type MethodArgumentValueSource = ValueSource;

export interface CallMethodStep extends SequenceStepBase {
  kind: "callMethod";
  methodId: string | null; // references MethodDefinition.id
  inputArguments: MethodArgumentValueSource[]; // one per declared input, in order
}

// Extensibility is the point of this union: a future step kind is one new
// variant + one new executor + one new card, no existing branches touched
// (TypeScript's exhaustiveness checking on `kind` flags any switch that
// misses a case).
export type SequenceStep = WriteStep | WaitAssertStep | DelayStep | CallMethodStep;
