import { useTagsStore } from "../tags/tags-store";
import { TagSelector } from "./TagSelector";
import { LiteralValueInput } from "./LiteralValueInput";
import { literalKindForDataType, defaultLiteralForKind } from "./literal-value";
import type { Comparison, WaitCondition } from "@shared/models/sequence-step";

const COMPARISONS: Comparison[] = ["equals", "notEquals", "tolerance", "greaterThan", "lessThan"];

export function WaitConditionEditor({
  stepId,
  prefix,
  condition,
  onChange,
}: {
  stepId: string;
  prefix: "conditionA" | "conditionB";
  condition: WaitCondition;
  onChange: (patch: Partial<WaitCondition>) => void;
}) {
  const tag = useTagsStore((s) => s.tags.find((t) => t.id === condition.tagId));
  const expectedTag = useTagsStore((s) => s.tags.find((t) => t.id === condition.expectedTagId));

  function handleTagChange(tagId: string): void {
    const nextTag = useTagsStore.getState().tags.find((t) => t.id === tagId);
    const patch: Partial<WaitCondition> = { tagId };
    if (condition.expectedSource === "constant") {
      const expectedKind = literalKindForDataType(nextTag?.dataType);
      if (expectedKind !== condition.expectedValue.type) {
        patch.expectedValue = defaultLiteralForKind(expectedKind);
      }
    }
    onChange(patch);
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        <TagSelector stepId={stepId} fieldPath={`${prefix}.tagId`} tagId={condition.tagId} onChange={handleTagChange} />
        <select value={condition.comparison} onChange={(e) => onChange({ comparison: e.target.value as Comparison })}>
          {COMPARISONS.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
        <select
          value={condition.expectedSource}
          onChange={(e) => onChange({ expectedSource: e.target.value as "constant" | "tag" })}
        >
          <option value="constant">constant</option>
          <option value="tag">other tag</option>
        </select>
        {condition.expectedSource === "constant" ? (
          <LiteralValueInput value={condition.expectedValue} onChange={(expectedValue) => onChange({ expectedValue })} />
        ) : (
          <TagSelector
            stepId={stepId}
            fieldPath={`${prefix}.expectedTagId`}
            tagId={condition.expectedTagId}
            onChange={(expectedTagId) => onChange({ expectedTagId })}
            placeholder="Compare to tag…"
          />
        )}
        {tag && <span style={{ fontSize: 12, color: "#999" }}>({tag.dataType})</span>}
        {condition.expectedSource === "tag" && expectedTag && (
          <span style={{ fontSize: 12, color: "#999" }}>({expectedTag.dataType})</span>
        )}
      </div>

      {condition.comparison === "tolerance" && (
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginLeft: 16, fontSize: 13 }}>
          <span>tolerance</span>
          <input
            type="number"
            value={condition.tolerance ?? 0}
            onChange={(e) => onChange({ tolerance: Number(e.target.value) })}
            style={{ width: 80 }}
          />
          <select
            value={condition.toleranceMode ?? "absolute"}
            onChange={(e) => onChange({ toleranceMode: e.target.value as "absolute" | "percent" })}
          >
            <option value="absolute">absolute</option>
            <option value="percent">percent</option>
          </select>
        </div>
      )}
    </div>
  );
}
