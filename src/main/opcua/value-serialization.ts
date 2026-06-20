import { DataType, Variant, type DataValue } from "node-opcua";
import type { OpcUaDataType } from "@shared/models/tag";
import type { TagValueDto } from "@shared/models/node-attributes";
import type { TagLiteralValue } from "@shared/models/sequence-step";

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
export function toVariant(literal: TagLiteralValue, dataType: OpcUaDataType): Variant {
  return new Variant({
    dataType: VARIANT_DATA_TYPE_FOR_TAG_TYPE[dataType] ?? DataType.Null,
    value: literal.value,
  });
}

export function toTagValueDto(dataValue: DataValue): TagValueDto {
  const variant = dataValue.value;
  const dataType = mapVariantDataType(variant?.dataType);
  let value: string | number | boolean | null = null;

  if (variant && variant.value !== null && variant.value !== undefined) {
    if (dataType === "Int64" || dataType === "UInt64") {
      // 64-bit ints as decimal strings - a plain JS number would lose precision.
      value = String(variant.value);
    } else if (dataType === "ByteString") {
      value = Buffer.isBuffer(variant.value) ? variant.value.toString("hex") : String(variant.value);
    } else if (variant.value instanceof Date) {
      value = variant.value.toISOString();
    } else if (typeof variant.value === "number" || typeof variant.value === "boolean" || typeof variant.value === "string") {
      value = variant.value;
    } else {
      value = String(variant.value);
    }
  }

  return {
    dataType,
    value,
    sourceTimestamp: dataValue.sourceTimestamp ? dataValue.sourceTimestamp.toISOString() : null,
    statusCode: { name: dataValue.statusCode.name, description: dataValue.statusCode.description },
  };
}
