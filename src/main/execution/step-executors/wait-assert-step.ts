import { AttributeIds, type Variant } from "node-opcua";
import type { WaitAssertStep, WaitCondition, Comparison, ToleranceMode } from "@shared/models/sequence-step";
import type { StepResult } from "@shared/models/run-result";
import type { RunContext } from "./step-executor";
import { nowIso, durationMs, raceWithCancellation, CANCELLED } from "./step-executor";
import { resolveNodeIdFromTagReference } from "../../opcua/node-id-utils";
import { callMethod } from "../../opcua/method-service";
import { toTagValueDto, variantToScalar } from "../../opcua/value-serialization";
import { resolveStepOutputScalar, resolveValueSourceVariant } from "./value-source";

type ScalarValue = string | number | boolean;

// undefined = baseline not captured yet (first poll); null/scalar = the value
// observed on that first poll, kept for the rest of this step's execution.
interface ChangeBaseline {
  value: ScalarValue | null | undefined;
}

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
  expected: ScalarValue | null;
  describe: string;
}

// The condition's subject: either a tag's live value (read once per poll) or
// a method's output (the method is re-invoked once per poll, exactly like a
// tag is re-read - lets "wait until" target a method directly, e.g. "wait
// until getMachineSpeed() returns >= 100" with no tag involved at all).
async function readSubject(condition: WaitCondition, ctx: RunContext): Promise<{ actual: ScalarValue | null; label: string }> {
  if (condition.subjectSource === "method") {
    const { methodId, methodOutputIndex, methodInputArguments } = condition.methodSubject;
    if (!methodId) throw new Error("No method selected");
    const method = ctx.methods.get(methodId);
    if (!method) throw new Error("Method not found");

    const objectNodeId = await resolveNodeIdFromTagReference(ctx.session, method.objectNode);
    const methodNodeId = await resolveNodeIdFromTagReference(ctx.session, method.methodNode);
    const inputVariants: Variant[] = [];
    for (let index = 0; index < method.inputArguments.length; index++) {
      const argumentMeta = method.inputArguments[index];
      const source = methodInputArguments[index];
      if (!source) throw new Error(`Missing a value for input argument "${argumentMeta.name}"`);
      inputVariants.push(await resolveValueSourceVariant(source, argumentMeta.dataType, ctx));
    }

    const result = await callMethod(ctx.session, objectNodeId, methodNodeId, inputVariants);
    if (!result.isGood) throw new Error(`Method call failed: ${result.statusCodeText}`);
    const variant = result.outputArguments[methodOutputIndex];
    if (!variant) throw new Error(`Method has no output at index ${methodOutputIndex}`);
    return { actual: variantToScalar(variant), label: method.alias };
  }

  if (!condition.tagId) throw new Error("No tag selected");
  const tag = ctx.tags.get(condition.tagId);
  if (!tag) throw new Error("Tag not found");
  const nodeId = await resolveNodeIdFromTagReference(ctx.session, tag.node);
  const dataValue = await ctx.session.read({ nodeId, attributeId: AttributeIds.Value });
  return { actual: toTagValueDto(dataValue).value, label: tag.alias };
}

async function evaluateCondition(
  condition: WaitCondition,
  ctx: RunContext,
  baseline: ChangeBaseline
): Promise<ConditionEvaluation> {
  const { actual, label } = await readSubject(condition, ctx);

  if (condition.comparison === "changed") {
    // First poll of this step's execution just establishes the baseline -
    // never satisfied on its own (there's nothing to have changed from yet).
    if (baseline.value === undefined) {
      baseline.value = actual;
      return { ok: false, actual, expected: actual, describe: `${label} changed (baseline ${String(actual)})` };
    }
    const ok = actual !== baseline.value;
    return {
      ok,
      actual,
      expected: baseline.value,
      describe: `${label} changed from ${String(baseline.value)} (actual: ${String(actual)})`,
    };
  }

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
  } else if (condition.expectedSource === "stepOutput") {
    if (!condition.expectedStepOutput) throw new Error("No step output selected for comparison");
    const resolved = resolveStepOutputScalar(condition.expectedStepOutput, ctx);
    if (resolved === null) throw new Error("Referenced step output has no value");
    expected = resolved;
  } else {
    expected = condition.expectedValue.value;
  }

  const ok = compareValues(actual, expected, condition.comparison, condition.tolerance, condition.toleranceMode);
  return { ok, actual, expected, describe: `${label} ${condition.comparison} ${String(expected)} (actual: ${String(actual)})` };
}

export async function executeWaitAssertStep(step: WaitAssertStep, ctx: RunContext): Promise<StepResult> {
  const startedAt = nowIso();
  const deadline = step.timeoutMs === null ? null : Date.now() + step.timeoutMs;
  const baselineA: ChangeBaseline = { value: undefined };
  const baselineB: ChangeBaseline = { value: undefined };

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
          const a = await evaluateCondition(step.conditionA, ctx, baselineA);
          const b = step.conditionB ? await evaluateCondition(step.conditionB, ctx, baselineB) : null;
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
        expectedValue: evalB ? undefined : (evalA.expected ?? undefined),
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
        expectedValue: evalB ? undefined : (evalA.expected ?? undefined),
        message: `Timed out after ${step.timeoutMs}ms waiting for ${describe}`,
      };
    }

    await sleep(deadline === null ? step.pollIntervalMs : Math.min(step.pollIntervalMs, deadline - Date.now()));
  }
}
