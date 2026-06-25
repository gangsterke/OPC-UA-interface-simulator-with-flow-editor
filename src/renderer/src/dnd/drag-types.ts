import type { BrowseTreeNode } from "@shared/models/browse-tree-node";
import type { Tag } from "@shared/models/tag";

export type DragPayload =
  | { source: "browseTree"; node: BrowseTreeNode; parentNodeId: string }
  | { source: "tagsPanel"; tag: Tag };

export const TAGS_PANEL_DROP_ZONE_ID = "tags-panel-drop-zone";
export const METHODS_PANEL_DROP_ZONE_ID = "methods-panel-drop-zone";
export const STEP_TAG_DROP_PREFIX = "step-tag-drop:";
// Separates stepId from the field path within a drop zone id, e.g.
// "step-tag-drop:<stepId>::conditionA.expectedTagId".
export const STEP_TAG_DROP_FIELD_SEPARATOR = "::";
