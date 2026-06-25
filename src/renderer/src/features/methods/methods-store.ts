import { create } from "zustand";
import type { MethodDefinition } from "@shared/models/method";
import type { BrowseTreeNode } from "@shared/models/browse-tree-node";

interface MethodsStoreState {
  methods: MethodDefinition[];
  addMethodFromNode: (node: BrowseTreeNode, parentNodeId: string) => Promise<void>;
  renameMethod: (id: string, alias: string) => void;
  removeMethod: (id: string) => void;
  setMethods: (methods: MethodDefinition[]) => void;
}

function dedupeAlias(existing: MethodDefinition[], base: string): string {
  let alias = base;
  let suffix = 1;
  while (existing.some((m) => m.alias === alias)) {
    alias = `${base}_${suffix}`;
    suffix += 1;
  }
  return alias;
}

export const useMethodsStore = create<MethodsStoreState>((set) => ({
  methods: [],

  async addMethodFromNode(node, parentNodeId) {
    if (node.nodeClass !== "Method") return;

    const result = await window.api.method.readArguments(parentNodeId, node.nodeId);

    set((state) => {
      const alreadyExists = state.methods.some(
        (m) => m.methodNode.namespaceUri === result.methodNode.namespaceUri && m.methodNode.identifier === result.methodNode.identifier
      );
      if (alreadyExists) return state;

      const method: MethodDefinition = {
        id: crypto.randomUUID(),
        alias: dedupeAlias(state.methods, node.displayName),
        objectNode: result.objectNode,
        methodNode: result.methodNode,
        inputArguments: result.inputArguments,
        outputArguments: result.outputArguments,
      };
      return { methods: [...state.methods, method] };
    });
  },

  renameMethod(id, alias) {
    set((state) => ({ methods: state.methods.map((m) => (m.id === id ? { ...m, alias } : m)) }));
  },

  removeMethod(id) {
    set((state) => ({ methods: state.methods.filter((m) => m.id !== id) }));
  },

  setMethods(methods) {
    set({ methods });
  },
}));
