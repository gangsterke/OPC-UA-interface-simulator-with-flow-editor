import { useEffect } from "react";
import { useRunStore } from "./run-store";
import { RunControlBar } from "./RunControlBar";
import { RunResultsList } from "./RunResultsList";
import { RunLogPanel } from "./RunLogPanel";

export function RunPanel() {
  const init = useRunStore((s) => s.init);

  useEffect(() => {
    init();
  }, [init]);

  return (
    <fieldset style={{ border: "1px solid #ccc", borderRadius: 8, padding: 16, maxWidth: 560 }}>
      <legend>Run</legend>
      <RunControlBar />
      <RunResultsList />
      <div style={{ marginTop: 8 }}>
        <RunLogPanel />
      </div>
    </fieldset>
  );
}
