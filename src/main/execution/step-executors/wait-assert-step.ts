import { AttributeIds } from "node-opcua";
import type { WaitAssertStep, WaitCondition, Comparison, ToleranceMode } from "@shared/models/sequence-step";
import type { StepResult } from "@shared/models/run-result";
import type { RunContext } from "./step-executor";
import { nowIso, durationMs, raceWithCancellation, CANCELLED } from "./step-executor";
import { resolveNodeIdFromTagReference } from "../../opcua/node-id-utils";
import { toTagValueDto } from "../../opcua/value-serialization";

type ScalarValue = string | number | boolean;

function compareValues(
  actual: ScalarValue | null,
  expected: ScalarValue,
  comparison: Comparison,
  tolerance: number | undefined,
  toleranceMode: ToleranceMode | undefined
): boolean {
  switch (comparison) {
    case "equals":
      return actual === expected;
    case "notEquals":
      return actual !== expected;
    case "greaterThan":
      return typeof actual === "number" && typeof expected === "number" && actual > expected;
    case "lessThan":
      return typeof actual === "number" && typeof expected === "number" && actual < expected;
    case "tolerance": {
      if (typeof actual !== "number" || typeof expected !== "number") return false;
      const band = toleranceMode === "percent" ? Math.abs(expected) * ((tolerance ?? 0) / 100) : tolerance ?? 0;
      return Math.abs(actual - expected) <= band;
    }
    default:
      return false;
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, Math.max(0, ms)));
}

function errorResult(step: WaitAssertStep, startedAt: string, message: string): StepResult {
  const finishedAt = nowIso();
  return { stepId: step.id, kind: step.kind, outcome: "error", startedAt, finishedAt, durationMs: durationMs(startedAt, finishedAt), message };
}

interface ConditionEvaluation {
  ok: boolean;
  actual: ScalarValue | null;
  expected: ScalarValue;
  describe: string;
}

async function evaluateCondition(condition: WaitCondition, ctx: RunContext): Promise<ConditionEvaluation> {
  if (!condition.tagId) throw new Error("No tag selected");
  const tag = ctx.tags.get(condition.tagId);
  if (!tag) throw new Error("Tag not found");

  const nodeId = await resolveNodeIdFromTagReference(ctx.session, tag.node);
  const dataValue = await ctx.session.read({ nodeId, attributeId: AttributeIds.Value });
  const actual = toTagValueDto(dataValue).value;

  let expected: ScalarValue;
  if (condition.expectedSource === "tag") {
    if (!condition.expectedTagId) throw new Error("No comparison tag selected");
    const expectedTag = ctx.tags.get(condition.expectedTagId);
    if (!expectedTag) throw new Error("Comparison tag not found");
    const expectedNodeId = await resolveNodeIdFromTagReference(ctx.session, expectedTag.node);
    const expectedDataValue = await ctx.session.read({ nodeId: expectedNodeId, attributeId: AttributeIds.Value });
    const expectedActual = toTagValueDto(expectedDataValue).value;
    if (expectedActual === null) throw new Error("Comparison tag has no value");
    expected = expectedActual;
  } else {
    expected = condition.expectedValue.value;
  }

  const ok = compareValues(actual, expected, condition.comparison, condition.tolerance, condition.toleranceMode);
  return { ok, actual, expected, describe: `${tag.alias} ${condition.comparison} ${String(expected)} (actual: ${String(actual)})` };
}

export async function executeWaitAssertStep(step: WaitAssertStep, ctx: RunContext): Promise<StepResult> {
  const startedAt = nowIso();
  const deadline = step.timeoutMs === null ? null : Date.now() + step.timeoutMs;

  while (true) {
    if (ctx.cancellationToken.isCancelled) {
      const finishedAt = nowIso();
      return { stepId: step.id, kind: step.kind, outcome: "cancelled", startedAt, finishedAt, durationMs: durationMs(startedAt, finishedAt) };
    }

    let evalA: ConditionEvaluation;
    let evalB: ConditionEvaluation | null = null;
    try {
      // Races the (possibly slow/unresponsive) read calls against
      // cancellation so Stop is never blocked behind an in-flight read.
      const result = await raceWithCancellation(
        (async () => {
          const a = await evaluateCondition(step.conditionA, ctx);
          const b = step.conditionB ? await evaluateCondition(step.conditionB, ctx) : null;
          return { a, b };
        })(),
        ctx.cancellationToken
      );
      if (result === CANCELLED) {
        const finishedAt = nowIso();
        return { stepId: step.id, kind: step.kind, outcome: "cancelled", startedAt, finishedAt, durationMs: durationMs(startedAt, finishedAt) };
      }
      evalA = result.a;
      evalB = result.b;
    } catch (err) {
      return errorResult(step, startedAt, err instanceof Error ? err.message : String(err));
    }

    const combinedOk = evalB ? (step.combinator === "AND" ? evalA.ok && evalB.ok : evalA.ok || evalB.ok) : evalA.ok;
    const describe = evalB ? `A: ${evalA.describe}; B: ${evalB.describe} (${step.combinator})` : evalA.describe;
    ctx.onProgress({ elapsedMs: Date.now() - new Date(startedAt).getTime(), lastValue: describe });

    if (combinedOk) {
      const finishedAt = nowIso();
      return {
        stepId: step.id,
        kind: step.kind,
        outcome: "pass",
        startedAt,
        finishedAt,
        durationMs: durationMs(startedAt, finishedAt),
        actualValue: evalB ? describe : evalA.actual,
        expectedValue: evalB ? undefined : evalA.expected,
      };
    }

    if (deadline !== null && Date.now() >= deadline) {
      const finishedAt = nowIso();
      return {
        stepId: step.id,
        kind: step.kind,
        outcome: "fail",
        startedAt,
        finishedAt,
        durationMs: durationMs(startedAt, finishedAt),
        actualValue: evalB ? describe : evalA.actual,
        expectedValue: evalB ? undefined : evalA.expected,
        message: `Timed out after ${step.timeoutMs}ms waiting for ${describe}`,
      };
    }

    await sleep(deadline === null ? step.pollIntervalMs : Math.min(step.pollIntervalMs, deadline - Date.now()));
  }
}
