import { useDroppable } from "@dnd-kit/core";
import { useTagsStore } from "./tags-store";
import { TagRow } from "./TagRow";
import { TAGS_PANEL_DROP_ZONE_ID } from "../../dnd/drag-types";

export function TagsPanel() {
  const tags = useTagsStore((s) => s.tags);
  const { setNodeRef, isOver } = useDroppable({ id: TAGS_PANEL_DROP_ZONE_ID });

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
      <legend>Tags</legend>
      {tags.length === 0 && (
        <p style={{ color: "#666" }}>Drag a Variable node from the address space tree here.</p>
      )}
      {isOver && <p style={{ color: "#1a73e8", fontWeight: 600 }}>Drop to create a tag</p>}
      {tags.map((tag) => (
        <TagRow key={tag.id} tag={tag} />
      ))}
    </fieldset>
  );
}
