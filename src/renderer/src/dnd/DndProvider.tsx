import { useState } from "react";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  KeyboardSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { arrayMove, sortableKeyboardCoordinates } from "@dnd-kit/sortable";
import type { ReactNode } from "react";
import { useTagsStore } from "../features/tags/tags-store";
import { useMethodsStore } from "../features/methods/methods-store";
import { useSequenceStore } from "../features/sequence/sequence-store";
import {
  TAGS_PANEL_DROP_ZONE_ID,
  METHODS_PANEL_DROP_ZONE_ID,
  STEP_TAG_DROP_PREFIX,
  STEP_TAG_DROP_FIELD_SEPARATOR,
  type DragPayload,
} from "./drag-types";

function labelForPayload(payload: DragPayload | undefined): string | null {
  if (!payload) return null;
  if (payload.source === "browseTree") {
    return payload.node.nodeClass === "Method" ? `ƒ ${payload.node.displayName}` : `🔢 ${payload.node.displayName}`;
  }
  return `⠿ ${payload.tag.alias}`;
}

// useSortable() attaches its own non-empty data ({ sortable: {...} }) to every
// sortable item's active.data.current, so a plain truthiness check can't tell
// "this is a sortable reorder" apart from "this is one of our custom drags" -
// both are truthy objects. Only our own drags carry a `source` field.
function asCustomPayload(data: Record<string, unknown> | undefined): DragPayload | undefined {
  if (data && "source" in data) return data as unknown as DragPayload;
  return undefined;
}

export function DndProvider({ children }: { children: ReactNode }) {
  const addTagFromNode = useTagsStore((s) => s.addTagFromNode);
  const addMethodFromNode = useMethodsStore((s) => s.addMethodFromNode);
  const setStepTag = useSequenceStore((s) => s.setStepTag);
  const setWriteValueTagSource = useSequenceStore((s) => s.setWriteValueTagSource);
  const setConditionTagField = useSequenceStore((s) => s.setConditionTagField);
  const setInputArgumentSource = useSequenceStore((s) => s.setInputArgumentSource);
  const setConditionMethodInputSource = useSequenceStore((s) => s.setConditionMethodInputSource);
  const steps = useSequenceStore((s) => s.steps);
  const reorderSteps = useSequenceStore((s) => s.reorderSteps);
  const [activeLabel, setActiveLabel] = useState<string | null>(null);

  // A small activation distance avoids treating a plain click as a drag,
  // while still making an intentional drag pick up immediately. KeyboardSensor
  // gives non-pointer users a way to pick up/move/drop the same draggable
  // elements (Space/Enter to grab, arrow keys to move, Space/Enter to drop,
  // Escape to cancel) - dnd-kit wires this up automatically as long as the
  // draggable's `attributes` are spread onto the element, which they are.
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  function handleDragStart(event: DragStartEvent): void {
    const payload = asCustomPayload(event.active.data.current);
    setActiveLabel(payload ? labelForPayload(payload) : null);
  }

  function handleDragEnd(event: DragEndEvent): void {
    setActiveLabel(null);
    const { active, over } = event;
    if (!over) return;

    const payload = asCustomPayload(active.data.current);

    if (payload?.source === "browseTree" && over.id === TAGS_PANEL_DROP_ZONE_ID) {
      addTagFromNode(payload.node);
      return;
    }

    if (payload?.source === "browseTree" && over.id === METHODS_PANEL_DROP_ZONE_ID) {
      addMethodFromNode(payload.node, payload.parentNodeId);
      return;
    }

    if (payload?.source === "tagsPanel" && typeof over.id === "string" && over.id.startsWith(STEP_TAG_DROP_PREFIX)) {
      const [stepId, fieldPath] = over.id.slice(STEP_TAG_DROP_PREFIX.length).split(STEP_TAG_DROP_FIELD_SEPARATOR);
      if (fieldPath === "tagId") {
        setStepTag(stepId, payload.tag.id);
      } else if (fieldPath === "write.value.tagId") {
        setWriteValueTagSource(stepId, payload.tag.id);
      } else if (fieldPath.startsWith("callMethod.")) {
        const argumentIndex = Number(fieldPath.split(".")[1]);
        setInputArgumentSource(stepId, argumentIndex, { source: "tag", tagId: payload.tag.id, fieldPath: [] });
      } else if (fieldPath.startsWith("conditionA.methodSubject.") || fieldPath.startsWith("conditionB.methodSubject.")) {
        const [prefix, , indexText] = fieldPath.split(".");
        const which = prefix === "conditionA" ? "A" : "B";
        setConditionMethodInputSource(stepId, which, Number(indexText), {
          source: "tag",
          tagId: payload.tag.id,
          fieldPath: [],
        });
      } else {
        setConditionTagField(stepId, fieldPath, payload.tag.id);
      }
      return;
    }

    // Sequence step reordering (dnd-kit/sortable): no custom payload means
    // this drag came from a plain useSortable() item, not browseTree/tagsPanel.
    if (!payload && active.id !== over.id) {
      const oldIndex = steps.findIndex((s) => s.id === active.id);
      const newIndex = steps.findIndex((s) => s.id === over.id);
      if (oldIndex !== -1 && newIndex !== -1) {
        reorderSteps(arrayMove(steps.map((s) => s.id), oldIndex, newIndex));
      }
    }
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      onDragCancel={() => setActiveLabel(null)}
    >
      {children}
      {/* dropAnimation=null: our drags create a side effect elsewhere (new tag,
          assigned field) rather than moving the source item, so the default
          "snap back to origin" animation looked like the chip flew to the
          wrong place - it should just vanish on drop instead. */}
      <DragOverlay dropAnimation={null}>
        {activeLabel && (
          <div
            style={{
              background: "#1a73e8",
              color: "white",
              padding: "4px 10px",
              borderRadius: 6,
              fontSize: 13,
              boxShadow: "0 2px 8px rgba(0,0,0,0.3)",
              pointerEvents: "none",
            }}
          >
            {activeLabel}
          </div>
        )}
      </DragOverlay>
    </DndContext>
  );
}
