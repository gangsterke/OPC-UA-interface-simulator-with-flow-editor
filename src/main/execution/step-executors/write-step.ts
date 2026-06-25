import { AttributeIds } from "node-opcua";
import type { WriteStep } from "@shared/models/sequence-step";
import type { StepResult } from "@shared/models/run-result";
import type { RunContext } from "./step-executor";
import { nowIso, durationMs } from "./step-executor";
import { resolveNodeIdFromTagReference } from "../../opcua/node-id-utils";
import { variantToScalar } from "../../opcua/value-serialization";
import { resolveValueSourceVariant } from "./value-source";

function errorResult(step: WriteStep, startedAt: string, message: string): StepResult {
  const finishedAt = nowIso();
  return { stepId: step.id, kind: step.kind, outcome: "error", startedAt, finishedAt, durationMs: durationMs(startedAt, finishedAt), message };
}

export async function executeWriteStep(step: WriteStep, ctx: RunContext): Promise<StepResult> {
  const startedAt = nowIso();

  if (!step.tagId) return errorResult(step, startedAt, "No tag selected");
  const tag = ctx.tags.get(step.tagId);
  if (!tag) return errorResult(step, startedAt, "Tag not found");

  try {
    const nodeId = await resolveNodeIdFromTagReference(ctx.session, tag.node);
    const variant = await resolveValueSourceVariant(step.value, tag.dataType, ctx);
    const statusCode = await ctx.session.write({ nodeId, attributeId: AttributeIds.Value, value: { value: variant } });
    const finishedAt = nowIso();

    if (statusCode.isGood()) {
      return {
        stepId: step.id,
        kind: step.kind,
        outcome: "pass",
        startedAt,
        finishedAt,
        durationMs: durationMs(startedAt, finishedAt),
        actualValue: variantToScalar(variant),
      };
    }
    return {
      stepId: step.id,
      kind: step.kind,
      outcome: "error",
      startedAt,
      finishedAt,
      durationMs: durationMs(startedAt, finishedAt),
      message: `Write failed: ${statusCode.toString()}`,
    };
  } catch (err) {
    return errorResult(step, startedAt, err instanceof Error ? err.message : String(err));
  }
}
