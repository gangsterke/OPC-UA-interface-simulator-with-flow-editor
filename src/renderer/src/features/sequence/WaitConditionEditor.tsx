import { useTagsStore } from "../tags/tags-store";
import { useSequenceStore } from "./sequence-store";
import { useMethodsStore } from "../methods/methods-store";
import { TagSelector } from "./TagSelector";
import { LiteralValueInput } from "./LiteralValueInput";
import { ValueSourceEditor } from "./ValueSourceEditor";
import { literalKindForDataType, defaultLiteralForKind } from "./literal-value";
import type { Comparison, WaitCondition } from "@shared/models/sequence-step";

const COMPARISONS: Comparison[] = ["equals", "notEquals", "tolerance", "greaterThan", "lessThan", "changed"];

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
  const which = prefix === "conditionA" ? "A" : "B";
  const tag = useTagsStore((s) => s.tags.find((t) => t.id === condition.tagId));
  const expectedTag = useTagsStore((s) => s.tags.find((t) => t.id === condition.expectedTagId));
  const allSteps = useSequenceStore((s) => s.steps);
  const setConditionMethod = useSequenceStore((s) => s.setConditionMethod);
  const setConditionMethodInputSource = useSequenceStore((s) => s.setConditionMethodInputSource);
  const methods = useMethodsStore((s) => s.methods);
  const subjectMethod = methods.find((m) => m.id === condition.methodSubject.methodId);

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

  function handleMethodOutputIndexChange(outputIndex: number): void {
    const patch: Partial<WaitCondition> = { methodSubject: { ...condition.methodSubject, methodOutputIndex: outputIndex } };
    if (condition.expectedSource === "constant") {
      const expectedKind = literalKindForDataType(subjectMethod?.outputArguments[outputIndex]?.dataType);
      if (expectedKind !== condition.expectedValue.type) {
        patch.expectedValue = defaultLiteralForKind(expectedKind);
      }
    }
    onChange(patch);
  }

  function handleExpectedSourceChange(expectedSource: "constant" | "tag" | "stepOutput"): void {
    const patch: Partial<WaitCondition> = { expectedSource };
    if (expectedSource === "constant") {
      const subjectDataType =
        condition.subjectSource === "method" ? subjectMethod?.outputArguments[condition.methodSubject.methodOutputIndex]?.dataType : tag?.dataType;
      const expectedKind = literalKindForDataType(subjectDataType);
      if (expectedKind !== condition.expectedValue.type) {
        patch.expectedValue = defaultLiteralForKind(expectedKind);
      }
    }
    onChange(patch);
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        <select
          value={condition.subjectSource}
          onChange={(e) => onChange({ subjectSource: e.target.value as "tag" | "method" })}
        >
          <option value="tag">tag</option>
          <option value="method">method call</option>
        </select>
        {condition.subjectSource === "tag" ? (
          <TagSelector stepId={stepId} fieldPath={`${prefix}.tagId`} tagId={condition.tagId} onChange={handleTagChange} />
        ) : (
          <select
            value={condition.methodSubject.methodId ?? ""}
            onChange={(e) => {
              const next = methods.find((m) => m.id === e.target.value);
              if (next) setConditionMethod(stepId, which, next);
            }}
          >
            <option value="" disabled>
              Select method…
            </option>
            {methods.map((m) => (
              <option key={m.id} value={m.id}>
                {m.alias}
              </option>
            ))}
          </select>
        )}
        {condition.subjectSource === "method" && methods.length === 0 && (
          <span style={{ fontSize: 12, color: "#999" }}>(drag a Method node into Methods first)</span>
        )}
        {condition.subjectSource === "method" && subjectMethod && subjectMethod.outputArguments.length > 0 && (
          <select
            value={condition.methodSubject.methodOutputIndex}
            onChange={(e) => handleMethodOutputIndexChange(Number(e.target.value))}
          >
            {subjectMethod.outputArguments.map((outArg, index) => (
              <option key={index} value={index}>
                {outArg.name}
              </option>
            ))}
          </select>
        )}
        {condition.subjectSource === "method" && subjectMethod && subjectMethod.outputArguments.length === 0 && (
          <span style={{ fontSize: 12, color: "#c92a2a" }}>(this method has no output - pick one that returns a value)</span>
        )}
        <select value={condition.comparison} onChange={(e) => onChange({ comparison: e.target.value as Comparison })}>
          {COMPARISONS.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
        {condition.comparison !== "changed" && (
          <>
            <select
              value={condition.expectedSource}
              onChange={(e) => handleExpectedSourceChange(e.target.value as "constant" | "tag" | "stepOutput")}
            >
              <option value="constant">constant</option>
              <option value="tag">other tag</option>
              <option value="stepOutput">prior step output</option>
            </select>
            {condition.expectedSource === "constant" && (
              <LiteralValueInput value={condition.expectedValue} onChange={(expectedValue) => onChange({ expectedValue })} />
            )}
            {condition.expectedSource === "tag" && (
              <TagSelector
                stepId={stepId}
                fieldPath={`${prefix}.expectedTagId`}
                tagId={condition.expectedTagId}
                onChange={(expectedTagId) => onChange({ expectedTagId })}
                placeholder="Compare to tag…"
              />
            )}
            {condition.expectedSource === "stepOutput" && (
              <>
                <select
                  value={
                    condition.expectedStepOutput?.stepId
                      ? `${condition.expectedStepOutput.stepId}:${condition.expectedStepOutput.outputIndex}`
                      : ""
                  }
                  onChange={(e) => {
                    const [pickedStepId, outputIndexText] = e.target.value.split(":");
                    onChange({
                      expectedStepOutput: {
                        stepId: pickedStepId,
                        outputIndex: Number(outputIndexText),
                        fieldPath: condition.expectedStepOutput?.fieldPath ?? [],
                      },
                    });
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
                  value={condition.expectedStepOutput?.fieldPath.join(".") ?? ""}
                  onChange={(e) =>
                    onChange({
                      expectedStepOutput: {
                        stepId: condition.expectedStepOutput?.stepId ?? null,
                        outputIndex: condition.expectedStepOutput?.outputIndex ?? 0,
                        fieldPath: e.target.value.split(".").filter(Boolean),
                      },
                    })
                  }
                  placeholder="field path, e.g. chamberState.actValue"
                  style={{ width: 200 }}
                />
              </>
            )}
          </>
        )}
        {condition.subjectSource === "tag" && tag && <span style={{ fontSize: 12, color: "#999" }}>({tag.dataType})</span>}
        {condition.subjectSource === "method" && subjectMethod?.outputArguments[condition.methodSubject.methodOutputIndex] && (
          <span style={{ fontSize: 12, color: "#999" }}>
            ({subjectMethod.outputArguments[condition.methodSubject.methodOutputIndex].dataType})
          </span>
        )}
        {condition.comparison !== "changed" && condition.expectedSource === "tag" && expectedTag && (
          <span style={{ fontSize: 12, color: "#999" }}>({expectedTag.dataType})</span>
        )}
      </div>

      {condition.subjectSource === "method" && subjectMethod && subjectMethod.inputArguments.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 4, marginLeft: 16 }}>
          {subjectMethod.inputArguments.map((argumentMeta, index) => (
            <ValueSourceEditor
              key={index}
              stepId={stepId}
              dndFieldId={`${prefix}.methodSubject.${index}`}
              label={argumentMeta.name}
              dataType={argumentMeta.dataType}
              source={condition.methodSubject.methodInputArguments[index]}
              onChange={(source) => setConditionMethodInputSource(stepId, which, index, source)}
            />
          ))}
        </div>
      )}

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
