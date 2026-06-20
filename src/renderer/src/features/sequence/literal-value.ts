import type { OpcUaDataType } from "@shared/models/tag";
import type { TagLiteralValue } from "@shared/models/sequence-step";

export function literalKindForDataType(dataType: OpcUaDataType | undefined): TagLiteralValue["type"] {
  switch (dataType) {
    case "Boolean":
      return "boolean";
    case "Int64":
    case "UInt64":
      return "int64";
    case "SByte":
    case "Byte":
    case "Int16":
    case "UInt16":
    case "Int32":
    case "UInt32":
    case "Float":
    case "Double":
      return "number";
    default:
      return "string";
  }
}

export function defaultLiteralForKind(kind: TagLiteralValue["type"]): TagLiteralValue {
  switch (kind) {
    case "boolean":
      return { type: "boolean", value: false };
    case "number":
      return { type: "number", value: 0 };
    case "int64":
      return { type: "int64", value: "0" };
    case "string":
      return { type: "string", value: "" };
  }
}
