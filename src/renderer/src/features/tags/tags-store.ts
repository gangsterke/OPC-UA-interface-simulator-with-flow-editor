import { create } from "zustand";
import type { Tag } from "@shared/models/tag";
import type { BrowseTreeNode } from "@shared/models/browse-tree-node";

interface TagsStoreState {
  tags: Tag[];
  addTagFromNode: (node: BrowseTreeNode) => Promise<void>;
  renameTag: (id: string, alias: string) => void;
  removeTag: (id: string) => void;
  setTags: (tags: Tag[]) => void;
}

function dedupeAlias(existing: Tag[], base: string): string {
  let alias = base;
  let suffix = 1;
  while (existing.some((t) => t.alias === alias)) {
    alias = `${base}_${suffix}`;
    suffix += 1;
  }
  return alias;
}

export const useTagsStore = create<TagsStoreState>((set) => ({
  tags: [],

  async addTagFromNode(node) {
    if (node.nodeClass !== "Variable") return;

    const attrs = await window.api.browse.readNodeAttributes(node.nodeId);

    set((state) => {
      const alreadyExists = state.tags.some(
        (t) => t.node.namespaceUri === attrs.node.namespaceUri && t.node.identifier === attrs.node.identifier
      );
      if (alreadyExists) return state;

      const tag: Tag = {
        id: crypto.randomUUID(),
        // displayName, not browseName - browseName's toString() includes a
        // namespace-index prefix (e.g. "3:Temperature"), which isn't useful here.
        alias: dedupeAlias(state.tags, node.displayName),
        node: attrs.node,
        dataType: attrs.dataType,
      };
      return { tags: [...state.tags, tag] };
    });
  },

  renameTag(id, alias) {
    set((state) => ({ tags: state.tags.map((t) => (t.id === id ? { ...t, alias } : t)) }));
  },

  removeTag(id) {
    set((state) => ({ tags: state.tags.filter((t) => t.id !== id) }));
  },

  setTags(tags) {
    set({ tags });
  },
}));
