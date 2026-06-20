import { useSequenceStore } from "../sequence-store";
import { useTagsStore } from "../../tags/tags-store";
import { TagSelector } from "../TagSelector";
import { LiteralValueInput } from "../LiteralValueInput";
import { literalKindForDataType, defaultLiteralForKind } from "../literal-value";
import type { WriteStep } from "@shared/models/sequence-step";

export function WriteStepCard({ step }: { step: WriteStep }) {
  const updateStep = useSequenceStore((s) => s.updateStep);
  const setStepTag = useSequenceStore((s) => s.setStepTag);
  const tag = useTagsStore((s) => s.tags.find((t) => t.id === step.tagId));

  function handleTagChange(tagId: string): void {
    setStepTag(step.id, tagId);
    const nextTag = useTagsStore.getState().tags.find((t) => t.id === tagId);
    const expectedKind = literalKindForDataType(nextTag?.dataType);
    if (expectedKind !== step.value.type) {
      updateStep(step.id, { value: defaultLiteralForKind(expectedKind) });
    }
  }

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
      <span>Write</span>
      <TagSelector stepId={step.id} fieldPath="tagId" tagId={step.tagId} onChange={handleTagChange} />
      <span>=</span>
      <LiteralValueInput value={step.value} onChange={(value) => updateStep(step.id, { value })} />
      {tag && <span style={{ fontSize: 12, color: "#999" }}>({tag.dataType})</span>}
    </div>
  );
}
