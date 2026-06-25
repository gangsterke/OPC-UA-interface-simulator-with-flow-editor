import { useState } from "react";
import { useDraggable } from "@dnd-kit/core";
import type { BrowseTreeNode as BrowseTreeNodeModel } from "@shared/models/browse-tree-node";
import { nodeClassIcon } from "./node-class-icons";
import type { DragPayload } from "../../dnd/drag-types";

interface Props {
  node: BrowseTreeNodeModel;
  depth: number;
  parentNodeId: string;
}

const DRAGGABLE_NODE_CLASSES = new Set(["Variable", "Method"]);

export function BrowseTreeNodeRow({ node, depth, parentNodeId }: Props) {
  const [expanded, setExpanded] = useState(false);
  const [children, setChildren] = useState<BrowseTreeNodeModel[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canExpand = node.hasChildrenHint;
  const isDraggable = DRAGGABLE_NODE_CLASSES.has(node.nodeClass);

  const dragPayload: DragPayload = { source: "browseTree", node, parentNodeId };
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `browse-node:${node.nodeId}`,
    data: dragPayload,
    disabled: !isDraggable,
  });

  async function toggleExpand(): Promise<void> {
    if (!expanded && children === null) {
      setLoading(true);
      setError(null);
      try {
        const fetched = await window.api.browse.children(node.nodeId);
        setChildren(fetched);
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      } finally {
        setLoading(false);
      }
    }
    setExpanded((value) => !value);
  }

  const dragHint =
    node.nodeClass === "Variable"
      ? "Drag into Tags to define a tag"
      : node.nodeClass === "Method"
        ? "Drag into Methods to define a callable method"
        : undefined;

  return (
    <div>
      <div
        ref={isDraggable ? setNodeRef : undefined}
        {...(isDraggable ? listeners : {})}
        {...(isDraggable ? attributes : {})}
        style={{
          paddingLeft: depth * 16,
          display: "flex",
          alignItems: "center",
          gap: 4,
          opacity: isDragging ? 0.4 : 1,
          cursor: isDraggable ? "grab" : "default",
        }}
        title={dragHint}
      >
        <span
          style={{ width: 14, display: "inline-block", cursor: canExpand ? "pointer" : "default" }}
          onClick={canExpand ? toggleExpand : undefined}
        >
          {canExpand ? (expanded ? "▾" : "▸") : ""}
        </span>
        <span>{nodeClassIcon(node.nodeClass)}</span>
        <span>{node.displayName}</span>
        <span style={{ color: "#999", fontSize: 12 }}>{node.nodeClass}</span>
      </div>
      {loading && <div style={{ paddingLeft: (depth + 1) * 16, color: "#999" }}>Loading…</div>}
      {error && <div style={{ paddingLeft: (depth + 1) * 16, color: "#c92a2a" }}>{error}</div>}
      {expanded && children && children.length === 0 && (
        <div style={{ paddingLeft: (depth + 1) * 16, color: "#999" }}>(no children)</div>
      )}
      {expanded &&
        children?.map((child) => (
          <BrowseTreeNodeRow key={child.nodeId} node={child} depth={depth + 1} parentNodeId={node.nodeId} />
        ))}
    </div>
  );
}
