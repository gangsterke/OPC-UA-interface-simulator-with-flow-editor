import { useRunStore } from "./run-store";
import { useSequenceStore } from "../sequence/sequence-store";

const OUTCOME_COLOR: Record<string, string> = {
  pass: "#1a7f37",
  fail: "#c92a2a",
  error: "#c92a2a",
  skipped: "#999",
  cancelled: "#999",
};

export function RunResultsList() {
  const steps = useSequenceStore((s) => s.steps);
  const stepResults = useRunStore((s) => s.stepResults);
  const currentStepIndex = useRunStore((s) => s.currentStepIndex);

  return (
    <div>
      {steps.map((step, index) => {
        const result = stepResults[step.id];
        const isCurrent = currentStepIndex === index;
        return (
          <div
            key={step.id}
            style={{
              display: "flex",
              gap: 8,
              padding: "4px 0",
              background: isCurrent ? "#fff8db" : undefined,
              fontSize: 13,
            }}
          >
            <span style={{ width: 20 }}>{index + 1}.</span>
            <span style={{ width: 90 }}>{step.kind}</span>
            <span style={{ width: 70, color: result ? OUTCOME_COLOR[result.outcome] : "#999", fontWeight: 600 }}>
              {result ? result.outcome : isCurrent ? "running…" : "—"}
            </span>
            {result?.actualValue !== undefined && result.actualValue !== null && (
              <span style={{ color: "#666" }}>
                actual: {String(result.actualValue)}
                {result.expectedValue !== undefined ? ` expected: ${String(result.expectedValue)}` : ""}
              </span>
            )}
            {result?.message && (
              <span
                style={{
                  color: result.outcome === "fail" || result.outcome === "error" ? "#c92a2a" : "#666",
                  fontWeight: result.outcome === "fail" || result.outcome === "error" ? 600 : undefined,
                }}
              >
                {result.message}
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
}
