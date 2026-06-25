import { useSequenceStore } from "./sequence-store";
import { useTagsStore } from "../tags/tags-store";
import { useMethodsStore } from "../methods/methods-store";
import { TagSelector } from "./TagSelector";
import { LiteralValueInput } from "./LiteralValueInput";
import { literalKindForDataType, defaultLiteralForKind } from "./literal-value";
import type { ValueSource } from "@shared/models/sequence-step";
import type { OpcUaDataType } from "@shared/models/tag";

// Edits a ValueSource: a typed-in constant, a live tag's value, or a prior
// CallMethodStep's captured output - both of the latter two can optionally
// drill into one field of a structured/array value by dot-path, e.g.
// "chamberState.actValue" or "3.value" (the 4th array element's value
// field). Shared by CallMethodStep's input arguments and WriteStep's value -
// dndFieldId keeps each editor instance's tag-drop target unique across the
// sequence.
export function ValueSourceEditor({
  stepId,
  dndFieldId,
  label,
  dataType,
  source,
  onChange,
}: {
  stepId: string;
  dndFieldId: string;
  label: string;
  dataType: OpcUaDataType;
  source: ValueSource;
  onChange: (source: ValueSource) => void;
}) {
  const allSteps = useSequenceStore((s) => s.steps);
  const methods = useMethodsStore((s) => s.methods);
  const tag = useTagsStore((s) => (source.source === "tag" ? s.tags.find((t) => t.id === source.tagId) : undefined));

  const selfIndex = allSteps.findIndex((s) => s.id === stepId);
  const precedingSteps = selfIndex === -1 ? [] : allSteps.slice(0, selfIndex);
  const stepOutputOptions = precedingSteps.flatMap((priorStep, priorIndex) => {
    if (priorStep.kind !== "callMethod" || !priorStep.methodId) return [];
    const method = methods.find((m) => m.id === priorStep.methodId);
    if (!method) return [];
    return method.outputArguments.map((outArg, outputIndex) => ({
      stepId: priorStep.id,
      outputIndex,
      label: `Step ${priorIndex + 1} (${method.alias}) → ${outArg.name}`,
    }));
  });

  function handleSourceKindChange(kind: ValueSource["source"]): void {
    if (kind === "constant") {
      onChange({ source: "constant", value: defaultLiteralForKind(literalKindForDataType(dataType)) });
    } else if (kind === "tag") {
      onChange({ source: "tag", tagId: null, fieldPath: [] });
    } else {
      onChange({ source: "stepOutput", stepId: null, outputIndex: 0, fieldPath: [] });
    }
  }

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
      <span style={{ width: 90, fontSize: 13 }}>
        {label} <span style={{ color: "#999" }}>({dataType})</span>
      </span>
      <select value={source.source} onChange={(e) => handleSourceKindChange(e.target.value as ValueSource["source"])}>
        <option value="constant">constant</option>
        <option value="tag">tag</option>
        <option value="stepOutput">prior step output</option>
      </select>

      {source.source === "constant" && (
        <LiteralValueInput value={source.value} onChange={(value) => onChange({ source: "constant", value })} />
      )}

      {source.source === "tag" && (
        <>
          <TagSelector
            stepId={stepId}
            fieldPath={`${dndFieldId}.tagId`}
            tagId={source.tagId}
            onChange={(tagId) => onChange({ source: "tag", tagId, fieldPath: [] })}
          />
          {tag && <span style={{ fontSize: 12, color: "#999" }}>({tag.dataType})</span>}
          <input
            type="text"
            value={source.fieldPath.join(".")}
            onChange={(e) =>
              onChange({ source: "tag", tagId: source.tagId, fieldPath: e.target.value.split(".").filter(Boolean) })
            }
            placeholder="field path, e.g. 3.value"
            style={{ width: 200 }}
          />
        </>
      )}

      {source.source === "stepOutput" && (
        <>
          <select
            value={source.stepId ? `${source.stepId}:${source.outputIndex}` : ""}
            onChange={(e) => {
              const [pickedStepId, outputIndexText] = e.target.value.split(":");
              onChange({ source: "stepOutput", stepId: pickedStepId, outputIndex: Number(outputIndexText), fieldPath: source.fieldPath });
            }}
          >
            <option value="" disabled>
              Select step output…
            </option>
            {stepOutputOptions.map((opt) => (
              <option key={`${opt.stepId}:${opt.outputIndex}`} value={`${opt.stepId}:${opt.outputIndex}`}>
                {opt.label}
              </option>
            ))}
          </select>
          {stepOutputOptions.length === 0 && (
            <span style={{ fontSize: 12, color: "#999" }}>
              (add a Call Method step before this one to get an output to pick from)
            </span>
          )}
          <input
            type="text"
            value={source.fieldPath.join(".")}
            onChange={(e) =>
              onChange({
                source: "stepOutput",
                stepId: source.stepId,
                outputIndex: source.outputIndex,
                fieldPath: e.target.value.split(".").filter(Boolean),
              })
            }
            placeholder="field path, e.g. chamberState.actValue"
            style={{ width: 200 }}
          />
        </>
      )}
    </div>
  );
}
