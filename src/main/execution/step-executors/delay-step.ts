import type { DelayStep } from "@shared/models/sequence-step";
import type { StepResult } from "@shared/models/run-result";
import type { RunContext } from "./step-executor";
import { nowIso, durationMs } from "./step-executor";

const PROGRESS_TICK_MS = 250;

export async function executeDelayStep(step: DelayStep, ctx: RunContext): Promise<StepResult> {
  const startedAt = nowIso();
  const start = Date.now();
  const deadline = start + step.durationMs;

  while (Date.now() < deadline) {
    if (ctx.cancellationToken.isCancelled) {
      const finishedAt = nowIso();
      return { stepId: step.id, kind: step.kind, outcome: "cancelled", startedAt, finishedAt, durationMs: durationMs(startedAt, finishedAt) };
    }
    const tick = Math.min(PROGRESS_TICK_MS, deadline - Date.now());
    await new Promise((resolve) => setTimeout(resolve, tick));
    ctx.onProgress({ elapsedMs: Date.now() - start });
  }

  const finishedAt = nowIso();
  return { stepId: step.id, kind: step.kind, outcome: "pass", startedAt, finishedAt, durationMs: durationMs(startedAt, finishedAt) };
}
