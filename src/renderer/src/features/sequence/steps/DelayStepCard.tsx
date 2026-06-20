import { useSequenceStore } from "../sequence-store";
import type { DelayStep } from "@shared/models/sequence-step";

export function DelayStepCard({ step }: { step: DelayStep }) {
  const updateStep = useSequenceStore((s) => s.updateStep);

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
      <span>Wait for</span>
      <input
        type="number"
        value={step.durationMs}
        onChange={(e) => updateStep(step.id, { durationMs: Number(e.target.value) })}
        style={{ width: 100 }}
      />
      <span>ms</span>
    </div>
  );
}
