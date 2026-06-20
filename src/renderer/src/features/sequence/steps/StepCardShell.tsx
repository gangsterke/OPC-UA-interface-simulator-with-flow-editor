import type { ReactNode } from "react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useSequenceStore } from "../sequence-store";
import type { SequenceStep } from "@shared/models/sequence-step";

const KIND_LABELS: Record<SequenceStep["kind"], string> = {
  write: "Write",
  waitAssert: "Wait/Assert",
  delay: "Delay",
};

export function StepCardShell({
  step,
  index,
  children,
}: {
  step: SequenceStep;
  index: number;
  children: ReactNode;
}) {
  const removeStep = useSequenceStore((s) => s.removeStep);
  const updateStep = useSequenceStore((s) => s.updateStep);
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: step.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={{
        ...style,
        border: "1px solid #ddd",
        borderRadius: 6,
        padding: 8,
        marginBottom: 8,
        background: "#fafafa",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <span {...attributes} {...listeners} style={{ cursor: "grab" }}>
          ⠿
        </span>
        <strong>
          {index + 1}. {KIND_LABELS[step.kind]}
        </strong>
        <label style={{ marginLeft: "auto", fontSize: 12 }}>
          <input
            type="checkbox"
            checked={step.enabled}
            onChange={(e) => updateStep(step.id, { enabled: e.target.checked })}
          />{" "}
          Enabled
        </label>
        <button onClick={() => removeStep(step.id)}>Delete</button>
      </div>
      <div style={{ marginTop: 8, marginLeft: 24 }}>{children}</div>
    </div>
  );
}
