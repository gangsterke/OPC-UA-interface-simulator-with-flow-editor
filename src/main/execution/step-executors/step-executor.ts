import type { ClientSession, Variant } from "node-opcua";
import type { SequenceStep } from "@shared/models/sequence-step";
import type { Tag } from "@shared/models/tag";
import type { MethodDefinition } from "@shared/models/method";
import type { StepResult } from "@shared/models/run-result";
import type { CancellationToken } from "../run-context";

export interface RunContext {
  session: ClientSession;
  tags: Map<string, Tag>;
  methods: Map<string, MethodDefinition>;
  // Raw Variants (not scalars) captured from each CallMethodStep executed so
  // far in this run, keyed by step id - lets a later step's input argument
  // source from an earlier step's output without round-tripping through a
  // real OPC UA tag (see MethodArgumentValueSource's "stepOutput" variant).
  methodOutputs: Map<string, Variant[]>;
  cancellationToken: CancellationToken;
  onProgress: (info: { elapsedMs: number; lastValue?: unknown }) => void;
}

export interface StepExecutor<T extends SequenceStep = SequenceStep> {
  execute(step: T, ctx: RunContext): Promise<StepResult>;
}

export function nowIso(): string {
  return new Date().toISOString();
}

export function durationMs(startedAtIso: string, finishedAtIso: string): number {
  return new Date(finishedAtIso).getTime() - new Date(startedAtIso).getTime();
}

export const CANCELLED = Symbol("cancelled");

// Races an in-flight async operation (e.g. a session.read()) against
// cancellation, so Stop is never blocked behind a slow/unresponsive server
// call - without this, cancellation is only observed between iterations of
// a poll loop, not while an awaited call is in flight.
export function raceWithCancellation<T>(promise: Promise<T>, token: CancellationToken): Promise<T | typeof CANCELLED> {
  return new Promise((resolve, reject) => {
    token.onCancel(() => resolve(CANCELLED));
    promise.then(resolve, reject);
  });
}
