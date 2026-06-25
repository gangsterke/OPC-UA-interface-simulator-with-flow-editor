import { DataType, Variant, type DataValue } from "node-opcua";
import type { OpcUaDataType } from "@shared/models/tag";
import type { TagValueDto } from "@shared/models/node-attributes";

// The only place that touches raw node-opcua Variant/DataValue/StatusCode
// objects for crossing the IPC boundary - keeps the "drag a node, value shows
// as [object Object]" class of bug localized to one module (plan section 4.3 / R5).
const DATA_TYPE_NAMES: Partial<Record<DataType, OpcUaDataType>> = {
  [DataType.Boolean]: "Boolean",
  [DataType.SByte]: "SByte",
  [DataType.Byte]: "Byte",
  [DataType.Int16]: "Int16",
  [DataType.UInt16]: "UInt16",
  [DataType.Int32]: "Int32",
  [DataType.UInt32]: "UInt32",
  [DataType.Int64]: "Int64",
  [DataType.UInt64]: "UInt64",
  [DataType.Float]: "Float",
  [DataType.Double]: "Double",
  [DataType.String]: "String",
  [DataType.DateTime]: "DateTime",
  [DataType.ByteString]: "ByteString",
  [DataType.Guid]: "Guid",
};

export function mapVariantDataType(dataType: DataType | undefined): OpcUaDataType {
  if (dataType === undefined) return "Unknown";
  return DATA_TYPE_NAMES[dataType] ?? "Unknown";
}

const VARIANT_DATA_TYPE_FOR_TAG_TYPE: Record<OpcUaDataType, DataType> = {
  Boolean: DataType.Boolean,
  SByte: DataType.SByte,
  Byte: DataType.Byte,
  Int16: DataType.Int16,
  UInt16: DataType.UInt16,
  Int32: DataType.Int32,
  UInt32: DataType.UInt32,
  Int64: DataType.Int64,
  UInt64: DataType.UInt64,
  Float: DataType.Float,
  Double: DataType.Double,
  String: DataType.String,
  DateTime: DataType.DateTime,
  ByteString: DataType.ByteString,
  Guid: DataType.Guid,
  Unknown: DataType.Null,
};

// Variant's constructor already coerces a decimal string into the internal
// [high, low] pair for Int64/UInt64 - verified empirically, no special-casing needed.
// Accepts a raw value rather than a TagLiteralValue so it can also wrap a
// value pulled from a structured method output's field (see resolveFieldPath).
export function toVariant(value: unknown, dataType: OpcUaDataType): Variant {
  return new Variant({
    dataType: VARIANT_DATA_TYPE_FOR_TAG_TYPE[dataType] ?? DataType.Null,
    value,
  });
}

// Raw decoded value of a Variant - a plain JS scalar, array, or object (for
// ExtensionObjects) with no display formatting. Used to drill into a
// structured output by field path; see variantToScalar for the
// display-string version of this.
export function variantToValue(variant: Variant | null | undefined): unknown {
  return variant ? variant.value : null;
}

// Walks a dot-path of field names into a decoded structured value, e.g.
// resolveFieldPath(content, ["chamberState", "actValue"]). Returns undefined
// if any segment is missing, distinguishing "not found" from a real null/0.
export function resolveFieldPath(value: unknown, fieldPath: string[]): unknown {
  let current = value;
  for (const key of fieldPath) {
    if (current === null || typeof current !== "object") return undefined;
    current = (current as Record<string, unknown>)[key];
  }
  return current;
}

// Shared by tag value reads and method output arguments - the only place
// that decides how a raw Variant's value becomes a plain JSON-safe scalar.
export function variantToScalar(variant: Variant | null | undefined): string | number | boolean | null {
  if (!variant || variant.value === null || variant.value === undefined) return null;
  const dataType = mapVariantDataType(variant.dataType);
  if (dataType === "Int64" || dataType === "UInt64") {
    // 64-bit ints as decimal strings - a plain JS number would lose precision.
    return String(variant.value);
  }
  if (dataType === "ByteString") {
    return Buffer.isBuffer(variant.value) ? variant.value.toString("hex") : String(variant.value);
  }
  if (variant.value instanceof Date) return variant.value.toISOString();
  if (typeof variant.value === "number" || typeof variant.value === "boolean" || typeof variant.value === "string") {
    return variant.value;
  }
  // Structured (ExtensionObject) and array values decode into plain objects/
  // arrays with their real field names (verified empirically against both a
  // built-in and a custom structured DataType) - JSON gives genuine visibility
  // into them instead of the useless "[object Object]" String() would produce.
  try {
    return JSON.stringify(variant.value);
  } catch {
    return String(variant.value);
  }
}

export function toTagValueDto(dataValue: DataValue): TagValueDto {
  const variant = dataValue.value;
  return {
    dataType: mapVariantDataType(variant?.dataType),
    value: variantToScalar(variant),
    sourceTimestamp: dataValue.sourceTimestamp ? dataValue.sourceTimestamp.toISOString() : null,
    statusCode: { name: dataValue.statusCode.name, description: dataValue.statusCode.description },
  };
}
