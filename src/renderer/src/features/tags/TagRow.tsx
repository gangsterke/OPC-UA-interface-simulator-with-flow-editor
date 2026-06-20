import { useEffect, useState } from "react";
import { useDraggable } from "@dnd-kit/core";
import { useTagsStore } from "./tags-store";
import type { Tag } from "@shared/models/tag";
import type { DragPayload } from "../../dnd/drag-types";

export function TagRow({ tag }: { tag: Tag }) {
  const renameTag = useTagsStore((s) => s.renameTag);
  const removeTag = useTagsStore((s) => s.removeTag);
  const [alias, setAlias] = useState(tag.alias);
  const [preview, setPreview] = useState<string>("…");

  const dragPayload: DragPayload = { source: "tagsPanel", tag };
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `tag:${tag.id}`,
    data: dragPayload,
  });

  useEffect(() => {
    let cancelled = false;

    function refresh(): void {
      window.api.tag
        .readValue(tag.node)
        .then((value) => {
          if (!cancelled) setPreview(`${value.value} (${value.statusCode.name})`);
        })
        .catch((err) => {
          if (!cancelled) setPreview(err instanceof Error ? `error: ${err.message}` : "error");
        });
    }

    refresh();
    // A "live" preview, not a true subscription - polling is simple and good
    // enough for eyeballing a tag's current value while building a sequence.
    const interval = setInterval(refresh, 1500);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [tag.id, tag.node]);

  function commitAlias(): void {
    const trimmed = alias.trim();
    if (trimmed && trimmed !== tag.alias) {
      renameTag(tag.id, trimmed);
    } else {
      setAlias(tag.alias);
    }
  }

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 8,
        padding: "4px 0",
        borderBottom: "1px solid #eee",
        opacity: isDragging ? 0.4 : 1,
      }}
    >
      <span
        ref={setNodeRef}
        {...listeners}
        {...attributes}
        style={{ cursor: "grab" }}
        title="Drag onto a step's tag field"
      >
        ⠿
      </span>
      <input
        value={alias}
        onChange={(e) => setAlias(e.target.value)}
        onBlur={commitAlias}
        onKeyDown={(e) => {
          if (e.key === "Enter") commitAlias();
        }}
        style={{ width: 120 }}
      />
      <span style={{ fontSize: 12, color: "#666", width: 60 }}>{tag.dataType}</span>
      <span style={{ fontSize: 12, color: "#999", flex: 1 }} title={tag.node.identifier}>
        {preview}
      </span>
      <button onClick={() => removeTag(tag.id)}>Remove</button>
    </div>
  );
}
