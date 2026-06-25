import { useSequenceStore } from "../sequence-store";
import { useTagsStore } from "../../tags/tags-store";
import { TagSelector } from "../TagSelector";
import { ValueSourceEditor } from "../ValueSourceEditor";
import { literalKindForDataType, defaultLiteralForKind } from "../literal-value";
import type { WriteStep } from "@shared/models/sequence-step";

export function WriteStepCard({ step }: { step: WriteStep }) {
  const updateStep = useSequenceStore((s) => s.updateStep);
  const setStepTag = useSequenceStore((s) => s.setStepTag);
  const tag = useTagsStore((s) => s.tags.find((t) => t.id === step.tagId));

  function handleTagChange(tagId: string): void {
    setStepTag(step.id, tagId);
    const nextTag = useTagsStore.getState().tags.find((t) => t.id === tagId);
    if (step.value.source === "constant") {
      const expectedKind = literalKindForDataType(nextTag?.dataType);
      if (expectedKind !== step.value.value.type) {
        updateStep(step.id, { value: { source: "constant", value: defaultLiteralForKind(expectedKind) } });
      }
    }
  }

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
      <span>Write</span>
      <TagSelector stepId={step.id} fieldPath="tagId" tagId={step.tagId} onChange={handleTagChange} />
      <span>=</span>
      <ValueSourceEditor
        stepId={step.id}
        dndFieldId="write.value"
        label="value"
        dataType={tag?.dataType ?? "Unknown"}
        source={step.value}
        onChange={(value) => updateStep(step.id, { value })}
      />
    </div>
  );
}
