import { AttributeIds, type Variant } from "node-opcua";
import type { ValueSource, StepOutputRef } from "@shared/models/sequence-step";
import type { OpcUaDataType } from "@shared/models/tag";
import type { RunContext } from "./step-executor";
import { resolveNodeIdFromTagReference } from "../../opcua/node-id-utils";
import { toVariant, variantToValue, resolveFieldPath } from "../../opcua/value-serialization";

function resolveStepOutputField(ref: StepOutputRef, ctx: RunContext): { variant: Variant; fieldValue: unknown } {
  if (!ref.stepId) throw new Error("No step selected as a value source");
  const outputs = ctx.methodOutputs.get(ref.stepId);
  if (!outputs) throw new Error("The referenced step has not produced any output yet");
  const variant = outputs[ref.outputIndex];
  if (!variant) throw new Error(`The referenced step has no output at index ${ref.outputIndex}`);
  if (ref.fieldPath.length === 0) return { variant, fieldValue: variantToValue(variant) };
  const fieldValue = resolveFieldPath(variantToValue(variant), ref.fieldPath);
  if (fieldValue === undefined) {
    throw new Error(`Field "${ref.fieldPath.join(".")}" not found in the referenced step's output`);
  }
  return { variant, fieldValue };
}

// Resolves any ValueSource into a Variant suitable for a write or a method
// input argument. A whole-value reference (empty fieldPath, for either "tag"
// or "stepOutput") passes the original Variant through untouched - needed
// for the PLC-requester pattern, where a structured "envelope" output is fed
// straight back in as another method's input of the very same structured
// type. A non-empty fieldPath drills into a structured/array value (e.g. an
// array-of-structs "Alarms" tag, or a structured method output) and re-wraps
// the extracted scalar using the destination's own declared dataType, since
// the original Variant carries no per-field OPC UA type once decoded.
export async function resolveValueSourceVariant(
  source: ValueSource,
  declaredDataType: OpcUaDataType,
  ctx: RunContext
): Promise<Variant> {
  if (source.source === "constant") {
    return toVariant(source.value.value, declaredDataType);
  }
  if (source.source === "tag") {
    if (!source.tagId) throw new Error("No tag selected as a value source");
    const tag = ctx.tags.get(source.tagId);
    if (!tag) throw new Error("Tag not found as a value source");
    const nodeId = await resolveNodeIdFromTagReference(ctx.session, tag.node);
    const dataValue = await ctx.session.read({ nodeId, attributeId: AttributeIds.Value });
    if (!dataValue.value) throw new Error("Tag has no value to use as a value source");
    if (source.fieldPath.length === 0) return dataValue.value;
    const fieldValue = resolveFieldPath(variantToValue(dataValue.value), source.fieldPath);
    if (fieldValue === undefined) {
      throw new Error(`Field "${source.fieldPath.join(".")}" not found in tag "${tag.alias}"'s value`);
    }
    return toVariant(fieldValue, declaredDataType);
  }
  const { variant, fieldValue } = resolveStepOutputField(source, ctx);
  if (source.fieldPath.length === 0) return variant;
  return toVariant(fieldValue, declaredDataType);
}

// Resolves a stepOutput reference (with optional fieldPath) to a plain
// comparable scalar, for use as a Wait/Assert condition's expected value.
export function resolveStepOutputScalar(ref: StepOutputRef, ctx: RunContext): string | number | boolean | null {
  const { fieldValue } = resolveStepOutputField(ref, ctx);
  if (fieldValue === null || fieldValue === undefined) return null;
  if (typeof fieldValue === "number" || typeof fieldValue === "boolean" || typeof fieldValue === "string") {
    return fieldValue;
  }
  if (fieldValue instanceof Date) return fieldValue.toISOString();
  try {
    return JSON.stringify(fieldValue);
  } catch {
    return String(fieldValue);
  }
}
