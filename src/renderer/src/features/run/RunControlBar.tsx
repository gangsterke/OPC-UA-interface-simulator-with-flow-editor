import { useRunStore } from "./run-store";
import { useSequenceStore } from "../sequence/sequence-store";
import { useTagsStore } from "../tags/tags-store";
import { useMethodsStore } from "../methods/methods-store";

const OUTCOME_LABEL: Record<string, string> = { passed: "Passed", failed: "Failed", cancelled: "Cancelled" };

export function RunControlBar() {
  const isRunning = useRunStore((s) => s.isRunning);
  const sessionActive = useRunStore((s) => s.sessionActive);
  const loopEnabled = useRunStore((s) => s.loopEnabled);
  const loopIteration = useRunStore((s) => s.loopIteration);
  const lastError = useRunStore((s) => s.lastError);
  const lastSummary = useRunStore((s) => s.lastSummary);
  const setLoopEnabled = useRunStore((s) => s.setLoopEnabled);
  const start = useRunStore((s) => s.start);
  const stop = useRunStore((s) => s.stop);
  const steps = useSequenceStore((s) => s.steps);
  const tags = useTagsStore((s) => s.tags);
  const methods = useMethodsStore((s) => s.methods);

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8, flexWrap: "wrap" }}>
      <button disabled={sessionActive || steps.length === 0} onClick={() => start(steps, tags, methods)}>
        Run
      </button>
      <button disabled={!sessionActive} onClick={() => stop()}>
        Stop
      </button>
      <label style={{ fontSize: 13 }}>
        <input
          type="checkbox"
          checked={loopEnabled}
          disabled={sessionActive}
          onChange={(e) => setLoopEnabled(e.target.checked)}
        />{" "}
        Loop until stopped
      </label>
      {isRunning && loopEnabled && <span style={{ fontSize: 13, color: "#666" }}>Iteration {loopIteration}</span>}
      {lastError && <span style={{ color: "#c92a2a" }}>{lastError}</span>}
      {!isRunning && lastSummary && (
        <span
          style={{
            fontWeight: 600,
            color: lastSummary.outcome === "passed" ? "#1a7f37" : lastSummary.outcome === "failed" ? "#c92a2a" : "#999",
          }}
        >
          {OUTCOME_LABEL[lastSummary.outcome]}
        </span>
      )}
    </div>
  );
}
