import { useSequenceStore } from "../sequence-store";
import { WaitConditionEditor } from "../WaitConditionEditor";
import type { ConditionCombinator, OnTimeout, WaitAssertStep } from "@shared/models/sequence-step";

export function WaitAssertStepCard({ step }: { step: WaitAssertStep }) {
  const updateStep = useSequenceStore((s) => s.updateStep);
  const updateCondition = useSequenceStore((s) => s.updateCondition);
  const addConditionB = useSequenceStore((s) => s.addConditionB);
  const removeConditionB = useSequenceStore((s) => s.removeConditionB);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <span>Wait until</span>
        <WaitConditionEditor
          stepId={step.id}
          prefix="conditionA"
          condition={step.conditionA}
          onChange={(patch) => updateCondition(step.id, "A", patch)}
        />
      </div>

      {step.conditionB ? (
        <>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginLeft: 16 }}>
            <select
              value={step.combinator}
              onChange={(e) => updateStep(step.id, { combinator: e.target.value as ConditionCombinator })}
            >
              <option value="AND">AND</option>
              <option value="OR">OR</option>
            </select>
            <button onClick={() => removeConditionB(step.id)}>Remove condition</button>
          </div>
          <div style={{ marginLeft: 16 }}>
            <WaitConditionEditor
              stepId={step.id}
              prefix="conditionB"
              condition={step.conditionB}
              onChange={(patch) => updateCondition(step.id, "B", patch)}
            />
          </div>
        </>
      ) : (
        <div style={{ marginLeft: 16 }}>
          <button onClick={() => addConditionB(step.id)}>+ Add condition (AND/OR)</button>
        </div>
      )}

      <div style={{ display: "flex", alignItems: "center", gap: 8, marginLeft: 16, fontSize: 13 }}>
        <label>
          <input
            type="checkbox"
            checked={step.timeoutMs === null}
            onChange={(e) => updateStep(step.id, { timeoutMs: e.target.checked ? null : 5000 })}
          />{" "}
          No timeout
        </label>
        <label>
          timeout (ms){" "}
          <input
            type="number"
            value={step.timeoutMs ?? ""}
            disabled={step.timeoutMs === null}
            onChange={(e) => updateStep(step.id, { timeoutMs: Number(e.target.value) })}
            style={{ width: 80 }}
          />
        </label>
        <label>
          poll every (ms){" "}
          <input
            type="number"
            value={step.pollIntervalMs}
            onChange={(e) => updateStep(step.id, { pollIntervalMs: Number(e.target.value) })}
            style={{ width: 80 }}
          />
        </label>
        <label>
          on timeout{" "}
          <select
            value={step.onTimeout}
            disabled={step.timeoutMs === null}
            onChange={(e) => updateStep(step.id, { onTimeout: e.target.value as OnTimeout })}
          >
            <option value="fail">fail</option>
            <option value="failAndContinue">fail and continue</option>
          </select>
        </label>
      </div>
    </div>
  );
}
