import type { OpcUaNodeClass } from "@shared/models/browse-tree-node";

const ICONS: Record<OpcUaNodeClass, string> = {
  Object: "📁",
  Variable: "🔢",
  Method: "ƒ",
  ObjectType: "🧩",
  VariableType: "🧩",
  ReferenceType: "🔗",
  DataType: "🏷️",
  View: "👁️",
  Unspecified: "❔",
};

export function nodeClassIcon(nodeClass: OpcUaNodeClass): string {
  return ICONS[nodeClass] ?? "❔";
}
