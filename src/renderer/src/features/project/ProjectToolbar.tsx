import { useEffect } from "react";
import { useProjectStore } from "./project-store";

export function ProjectToolbar() {
  const filePath = useProjectStore((s) => s.filePath);
  const isDirty = useProjectStore((s) => s.isDirty);
  const lastError = useProjectStore((s) => s.lastError);
  const init = useProjectStore((s) => s.init);
  const newProject = useProjectStore((s) => s.newProject);
  const save = useProjectStore((s) => s.save);
  const saveAs = useProjectStore((s) => s.saveAs);
  const open = useProjectStore((s) => s.open);

  useEffect(() => {
    init();
  }, [init]);

  const fileName = filePath ? filePath.split(/[/\\]/).pop() : "Untitled project";

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
      <button onClick={() => newProject()}>New</button>
      <button onClick={() => open()}>Open…</button>
      <button onClick={() => save()}>Save</button>
      <button onClick={() => saveAs()}>Save As…</button>
      <span style={{ fontSize: 13, color: "#666" }}>
        {fileName}
        {isDirty ? " *" : ""}
      </span>
      {lastError && <span style={{ color: "#c92a2a" }}>{lastError}</span>}
    </div>
  );
}
