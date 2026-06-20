import { SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable";
import {
  useSequenceStore,
  createDefaultWriteStep,
  createDefaultWaitAssertStep,
  createDefaultDelayStep,
} from "./sequence-store";
import { StepCardShell } from "./steps/StepCardShell";
import { WriteStepCard } from "./steps/WriteStepCard";
import { WaitAssertStepCard } from "./steps/WaitAssertStepCard";
import { DelayStepCard } from "./steps/DelayStepCard";

export function SequenceBuilder() {
  const steps = useSequenceStore((s) => s.steps);
  const addStep = useSequenceStore((s) => s.addStep);

  return (
    <fieldset style={{ border: "1px solid #ccc", borderRadius: 8, padding: 16, maxWidth: 560, minHeight: 200 }}>
      <legend>Signal Flow (Test Sequence)</legend>

      <SortableContext items={steps.map((s) => s.id)} strategy={verticalListSortingStrategy}>
        {steps.map((step, index) => (
          <StepCardShell key={step.id} step={step} index={index}>
            {step.kind === "write" && <WriteStepCard step={step} />}
            {step.kind === "waitAssert" && <WaitAssertStepCard step={step} />}
            {step.kind === "delay" && <DelayStepCard step={step} />}
          </StepCardShell>
        ))}
      </SortableContext>

      {steps.length === 0 && <p style={{ color: "#666" }}>No steps yet - add one below.</p>}

      <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
        <button onClick={() => addStep(createDefaultWriteStep())}>+ Write</button>
        <button onClick={() => addStep(createDefaultWaitAssertStep())}>+ Wait/Assert</button>
        <button onClick={() => addStep(createDefaultDelayStep())}>+ Delay</button>
      </div>
    </fieldset>
  );
}
