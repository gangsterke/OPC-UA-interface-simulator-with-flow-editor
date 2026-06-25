import { AttributeIds, DataType, type ClientSession, type Variant } from "node-opcua";
import type { MethodArgumentMeta } from "@shared/models/method";
import type { TagNodeReference } from "@shared/models/tag";
import { browseChildren } from "./browse-service";
import { mapVariantDataType } from "./value-serialization";
import { resolveTagNodeReference } from "./node-id-utils";

interface ArgumentLike {
  name?: string | null;
  dataType?: { namespace: number; value: unknown } | null;
  valueRank?: number | null;
}

// Argument.dataType is a NodeId, not a Variant - the numeric identifier under
// namespace 0 maps to the same builtin DataType enum value-serialization.ts
// already maps from Variants, so this delegates rather than duplicating the table.
function mapArgumentDataType(dataType: ArgumentLike["dataType"]): MethodArgumentMeta["dataType"] {
  if (!dataType || dataType.namespace !== 0 || typeof dataType.value !== "number") return "Unknown";
  return mapVariantDataType(dataType.value as DataType);
}

function toArgumentMeta(arg: ArgumentLike): MethodArgumentMeta {
  return {
    name: arg.name ?? "",
    dataType: mapArgumentDataType(arg.dataType),
    valueRank: arg.valueRank ?? -1,
  };
}

// InputArguments/OutputArguments are not attributes on the Method node itself -
// they're child Property Variable nodes (OPC UA Part 9), found by browsing the
// Method node's children (HasProperty is a HierarchicalReferences subtype, so
// the existing browseChildren() picks them up) and reading their Value, which
// holds an Argument[] describing each parameter (verified empirically).
async function readArgumentList(
  session: ClientSession,
  methodNodeId: string,
  propertyDisplayName: "InputArguments" | "OutputArguments"
): Promise<MethodArgumentMeta[]> {
  const children = await browseChildren(session, methodNodeId);
  const property = children.find((c) => c.displayName === propertyDisplayName);
  if (!property) return [];

  const dataValue = await session.read({ nodeId: property.nodeId, attributeId: AttributeIds.Value });
  const args = (dataValue.value?.value as ArgumentLike[] | null) ?? [];
  return args.map(toArgumentMeta);
}

export async function readMethodArguments(
  session: ClientSession,
  methodNodeId: string
): Promise<{ input: MethodArgumentMeta[]; output: MethodArgumentMeta[] }> {
  const [input, output] = await Promise.all([
    readArgumentList(session, methodNodeId, "InputArguments"),
    readArgumentList(session, methodNodeId, "OutputArguments"),
  ]);
  return { input, output };
}

export async function resolveMethodNodeReferences(
  session: ClientSession,
  objectNodeId: string,
  methodNodeId: string
): Promise<{ objectNode: TagNodeReference; methodNode: TagNodeReference }> {
  const [objectNode, methodNode] = await Promise.all([
    resolveTagNodeReference(session, objectNodeId),
    resolveTagNodeReference(session, methodNodeId),
  ]);
  return { objectNode, methodNode };
}

// Returns raw Variants (not scalars) - a subsequent CallMethodStep may need
// to feed an output straight back in as another method's input argument, so
// this stays full-fidelity; callers convert to a display scalar themselves
// (via variantToScalar) only when building a human-readable result/log line.
export async function callMethod(
  session: ClientSession,
  objectNodeId: string,
  methodNodeId: string,
  inputArguments: Variant[]
): Promise<{ isGood: boolean; statusCodeText: string; outputArguments: Variant[] }> {
  const result = await session.call({ objectId: objectNodeId, methodId: methodNodeId, inputArguments });
  return {
    isGood: result.statusCode.isGood(),
    statusCodeText: result.statusCode.toString(),
    outputArguments: result.outputArguments ?? [],
  };
}
