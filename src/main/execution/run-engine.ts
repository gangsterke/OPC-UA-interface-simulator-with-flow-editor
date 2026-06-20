import { EventEmitter } from "node:events";
import { randomUUID } from "node:crypto";
import type { ClientSession } from "node-opcua";
import type { SequenceStep } from "@shared/models/sequence-step";
import type { Tag } from "@shared/models/tag";
import type { StepResult, RunSummary } from "@shared/models/run-result";
import { CancellationToken } from "./run-context";
import type { RunContext, StepExecutor } from "./step-executors/step-executor";
import { nowIso, durationMs } from "./step-executors/step-executor";
import { executeWriteStep } from "./step-executors/write-step";
import { executeWaitAssertStep } from "./step-executors/wait-assert-step";
import { executeDelayStep } from "./step-executors/delay-step";

// Registry pattern (plan section 5.2): adding a future step kind is additive -
// one new executor + one new registry entry, no existing branches touched.
const registry: Record<SequenceStep["kind"], StepExecutor> = {
  write: { execute: executeWriteStep as StepExecutor["execute"] },
  waitAssert: { execute: executeWaitAssertStep as StepExecutor["execute"] },
  delay: { execute: executeDelayStep as StepExecutor["execute"] },
};

function syntheticResult(step: SequenceStep, outcome: "skipped" | "cancelled", message?: string): StepResult {
  const at = nowIso();
  return { stepId: step.id, kind: step.kind, outcome, startedAt: at, finishedAt: at, durationMs: 0, message };
}

// Owns no Electron dependency - unit-testable in isolation, same as OpcUaService.
export class RunEngine extends EventEmitter {
  private currentRunId: string | null = null;
  private cancellationToken: CancellationToken | null = null;

  isRunning(): boolean {
    return this.currentRunId !== null;
  }

  async startRun(session: ClientSession, steps: SequenceStep[], tags: Tag[]): Promise<string> {
    if (this.isRunning()) {
      throw new Error("A run is already in progress");
    }
    const runId = randomUUID();
    const cancellationToken = new CancellationToken();
    this.currentRunId = runId;
    this.cancellationToken = cancellationToken;

    const tagsById = new Map(tags.map((t) => [t.id, t]));

    // Fire-and-forget: progress/results stream via events, not the returned promise.
    void this.runSteps(runId, session, steps, tagsById, cancellationToken).finally(() => {
      if (this.currentRunId === runId) {
        this.currentRunId = null;
        this.cancellationToken = null;
      }
    });

    return runId;
  }

  cancel(runId: string): boolean {
    if (this.currentRunId !== runId || !this.cancellationToken) return false;
    this.cancellationToken.cancel();
    // Safety net: runSteps()'s own .finally() normally clears currentRunId
    // once it observes the cancellation, but if some step executor ever has
    // an unbounded hang we haven't anticipated, force it clear anyway so a
    // new run can still be started rather than leaving the engine wedged.
    setTimeout(() => {
      if (this.currentRunId === runId) {
        this.currentRunId = null;
        this.cancellationToken = null;
      }
    }, 5000);
    return true;
  }

  private async runSteps(
    runId: string,
    session: ClientSession,
    steps: SequenceStep[],
    tagsById: Map<string, Tag>,
    cancellationToken: CancellationToken
  ): Promise<void> {
    const startedAt = nowIso();
    const stepResults: StepResult[] = [];
    let aborted = false;

    for (let index = 0; index < steps.length; index++) {
      const step = steps[index];

      if (cancellationToken.isCancelled) {
        const result = syntheticResult(step, "cancelled");
        stepResults.push(result);
        this.emit("stepCompleted", { runId, stepIndex: index, result });
        continue;
      }

      if (aborted) {
        const result = syntheticResult(step, "skipped");
        stepResults.push(result);
        this.emit("stepCompleted", { runId, stepIndex: index, result });
        continue;
      }

      if (!step.enabled) {
        const result = syntheticResult(step, "skipped", "disabled");
        stepResults.push(result);
        this.emit("stepCompleted", { runId, stepIndex: index, result });
        this.emitLog(runId, "info", `Step ${index + 1} (${step.kind}) disabled, skipped`);
        continue;
      }

      this.emit("stepStarted", { runId, stepIndex: index, step });

      const ctx: RunContext = {
        session,
        tags: tagsById,
        cancellationToken,
        onProgress: (info) => this.emit("stepProgress", { runId, stepIndex: index, ...info }),
      };

      let result: StepResult;
      try {
        result = await registry[step.kind].execute(step, ctx);
      } catch (err) {
        const at = nowIso();
        result = {
          stepId: step.id,
          kind: step.kind,
          outcome: "error",
          startedAt: at,
          finishedAt: at,
          durationMs: 0,
          message: err instanceof Error ? err.message : String(err),
        };
      }

      stepResults.push(result);
      this.emit("stepCompleted", { runId, stepIndex: index, result });
      this.emitLog(
        runId,
        result.outcome === "pass" ? "info" : "warn",
        `Step ${index + 1} (${step.kind}): ${result.outcome}${result.message ? " - " + result.message : ""}`
      );

      if (result.outcome === "error") {
        aborted = true;
      } else if (result.outcome === "fail") {
        const continueOnFail = step.kind === "waitAssert" && step.onTimeout === "failAndContinue";
        if (!continueOnFail) aborted = true;
      }
    }

    const finishedAt = nowIso();
    const wasCancelled = stepResults.some((r) => r.outcome === "cancelled");
    const hasFailureOrError = stepResults.some((r) => r.outcome === "fail" || r.outcome === "error");
    const summary: RunSummary = {
      runId,
      outcome: wasCancelled ? "cancelled" : hasFailureOrError ? "failed" : "passed",
      startedAt,
      finishedAt,
      stepResults,
    };
    this.emitLog(runId, "info", `Run ${summary.outcome} (${durationMs(startedAt, finishedAt)}ms)`);
    this.emit("completed", { runId, summary });
  }

  private emitLog(runId: string, level: "info" | "warn" | "error", message: string): void {
    this.emit("log", { runId, level, message, timestamp: nowIso() });
  }
}
