import { useDroppable } from "@dnd-kit/core";
import { useTagsStore } from "../tags/tags-store";
import { STEP_TAG_DROP_PREFIX, STEP_TAG_DROP_FIELD_SEPARATOR } from "../../dnd/drag-types";

export function TagSelector({
  stepId,
  fieldPath,
  tagId,
  onChange,
  placeholder = "Select tag…",
}: {
  stepId: string;
  fieldPath: string;
  tagId: string | null;
  onChange: (tagId: string) => void;
  placeholder?: string;
}) {
  const tags = useTagsStore((s) => s.tags);
  const { setNodeRef, isOver } = useDroppable({
    id: `${STEP_TAG_DROP_PREFIX}${stepId}${STEP_TAG_DROP_FIELD_SEPARATOR}${fieldPath}`,
  });

  return (
    <span
      ref={setNodeRef}
      style={{
        display: "inline-block",
        border: isOver ? "2px dashed #1a73e8" : "2px solid transparent",
        borderRadius: 4,
        padding: 1,
      }}
    >
      <select
        value={tagId ?? ""}
        onChange={(e) => onChange(e.target.value)}
        style={{ background: isOver ? "#eef6ff" : undefined, minWidth: 110 }}
      >
        <option value="" disabled>
          {isOver ? "Drop to assign…" : placeholder}
        </option>
        {tags.map((tag) => (
          <option key={tag.id} value={tag.id}>
            {tag.alias}
          </option>
        ))}
      </select>
    </span>
  );
}
