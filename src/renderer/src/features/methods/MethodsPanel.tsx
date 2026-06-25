import { useDroppable } from "@dnd-kit/core";
import { useMethodsStore } from "./methods-store";
import { MethodRow } from "./MethodRow";
import { METHODS_PANEL_DROP_ZONE_ID } from "../../dnd/drag-types";

export function MethodsPanel() {
  const methods = useMethodsStore((s) => s.methods);
  const { setNodeRef, isOver } = useDroppable({ id: METHODS_PANEL_DROP_ZONE_ID });

  return (
    <fieldset
      ref={setNodeRef}
      style={{
        border: isOver ? "2px dashed #1a73e8" : "1px solid #ccc",
        borderRadius: 8,
        padding: 16,
        maxWidth: 480,
        minHeight: 200,
        background: isOver ? "#eef6ff" : undefined,
        transition: "background 0.1s, border-color 0.1s",
      }}
    >
      <legend>Methods</legend>
      {methods.length === 0 && (
        <p style={{ color: "#666" }}>Drag a Method node (ƒ) from the address space tree here.</p>
      )}
      {isOver && <p style={{ color: "#1a73e8", fontWeight: 600 }}>Drop to define a callable method</p>}
      {methods.map((method) => (
        <MethodRow key={method.id} method={method} />
      ))}
    </fieldset>
  );
}
