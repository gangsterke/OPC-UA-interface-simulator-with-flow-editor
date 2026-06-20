import { useRunStore } from "./run-store";

const LEVEL_COLOR: Record<string, string> = { info: "#ddd", warn: "#ffd43b", error: "#ff6b6b" };

export function RunLogPanel() {
  const log = useRunStore((s) => s.log);

  return (
    <div
      style={{
        maxHeight: 150,
        overflowY: "auto",
        background: "#111",
        color: "#ddd",
        fontFamily: "monospace",
        fontSize: 12,
        padding: 8,
        borderRadius: 4,
      }}
    >
      {log.length === 0 && <div style={{ color: "#888" }}>No run yet.</div>}
      {log.map((line, index) => (
        <div key={index} style={{ color: LEVEL_COLOR[line.level] }}>
          [{new Date(line.timestamp).toLocaleTimeString()}] {line.message}
        </div>
      ))}
    </div>
  );
}
