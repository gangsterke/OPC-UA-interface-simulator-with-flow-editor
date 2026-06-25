import type { Variant } from "node-opcua";
import type { CallMethodStep } from "@shared/models/sequence-step";
import type { StepResult } from "@shared/models/run-result";
import type { RunContext } from "./step-executor";
import { nowIso, durationMs } from "./step-executor";
import { resolveNodeIdFromTagReference } from "../../opcua/node-id-utils";
import { callMethod } from "../../opcua/method-service";
import { variantToScalar } from "../../opcua/value-serialization";
import { resolveValueSourceVariant } from "./value-source";

function errorResult(step: CallMethodStep, startedAt: string, message: string): StepResult {
  const finishedAt = nowIso();
  return { stepId: step.id, kind: step.kind, outcome: "error", startedAt, finishedAt, durationMs: durationMs(startedAt, finishedAt), message };
}

export async function executeCallMethodStep(step: CallMethodStep, ctx: RunContext): Promise<StepResult> {
  const startedAt = nowIso();

  if (!step.methodId) return errorResult(step, startedAt, "No method selected");
  const method = ctx.methods.get(step.methodId);
  if (!method) return errorResult(step, startedAt, "Method not found");

  try {
    const objectNodeId = await resolveNodeIdFromTagReference(ctx.session, method.objectNode);
    const methodNodeId = await resolveNodeIdFromTagReference(ctx.session, method.methodNode);

    const inputVariants: Variant[] = [];
    for (let index = 0; index < method.inputArguments.length; index++) {
      const argumentMeta = method.inputArguments[index];
      const source = step.inputArguments[index];
      if (!source) throw new Error(`Missing a value for input argument "${argumentMeta.name}"`);
      inputVariants.push(await resolveValueSourceVariant(source, argumentMeta.dataType, ctx));
    }

    const result = await callMethod(ctx.session, objectNodeId, methodNodeId, inputVariants);
    ctx.methodOutputs.set(step.id, result.outputArguments);

    const finishedAt = nowIso();
    const outputSummary = result.outputArguments
      .map((variant, index) => `${method.outputArguments[index]?.name ?? index}=${String(variantToScalar(variant))}`)
      .join(", ");

    if (result.isGood) {
      return {
        stepId: step.id,
        kind: step.kind,
        outcome: "pass",
        startedAt,
        finishedAt,
        durationMs: durationMs(startedAt, finishedAt),
        actualValue: outputSummary || undefined,
      };
    }
    return {
      stepId: step.id,
      kind: step.kind,
      outcome: "error",
      startedAt,
      finishedAt,
      durationMs: durationMs(startedAt, finishedAt),
      message: `Method call failed: ${result.statusCodeText}`,
    };
  } catch (err) {
    return errorResult(step, startedAt, err instanceof Error ? err.message : String(err));
  }
}
