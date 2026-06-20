import { create } from "zustand";
import type { SequenceStep, WriteStep, WaitAssertStep, DelayStep, WaitCondition } from "@shared/models/sequence-step";

type StepPatch = Partial<WriteStep> | Partial<WaitAssertStep> | Partial<DelayStep>;

function defaultCondition(): WaitCondition {
  return {
    tagId: null,
    comparison: "equals",
    expectedSource: "constant",
    expectedValue: { type: "boolean", value: true },
    expectedTagId: null,
  };
}

interface SequenceStoreState {
  steps: SequenceStep[];
  addStep: (step: SequenceStep) => void;
  removeStep: (id: string) => void;
  updateStep: (id: string, patch: StepPatch) => void;
  reorderSteps: (orderedIds: string[]) => void;
  setStepTag: (id: string, tagId: string) => void;
  updateCondition: (stepId: string, which: "A" | "B", patch: Partial<WaitCondition>) => void;
  addConditionB: (stepId: string) => void;
  removeConditionB: (stepId: string) => void;
  // fieldPath: "conditionA.tagId" | "conditionA.expectedTagId" | "conditionB.tagId" | "conditionB.expectedTagId"
  setConditionTagField: (stepId: string, fieldPath: string, tagId: string) => void;
  setSteps: (steps: SequenceStep[]) => void;
}

export const useSequenceStore = create<SequenceStoreState>((set) => ({
  steps: [],

  addStep(step) {
    set((state) => ({ steps: [...state.steps, step] }));
  },

  removeStep(id) {
    set((state) => ({ steps: state.steps.filter((s) => s.id !== id) }));
  },

  updateStep(id, patch) {
    set((state) => ({
      steps: state.steps.map((s) => (s.id === id ? ({ ...s, ...patch } as SequenceStep) : s)),
    }));
  },

  reorderSteps(orderedIds) {
    set((state) => {
      const byId = new Map(state.steps.map((s) => [s.id, s]));
      const reordered = orderedIds.map((id) => byId.get(id)).filter((s): s is SequenceStep => Boolean(s));
      return { steps: reordered };
    });
  },

  setStepTag(id, tagId) {
    set((state) => ({
      steps: state.steps.map((s) => (s.id === id && s.kind === "write" ? { ...s, tagId } : s)),
    }));
  },

  updateCondition(stepId, which, patch) {
    set((state) => ({
      steps: state.steps.map((s) => {
        if (s.id !== stepId || s.kind !== "waitAssert") return s;
        if (which === "A") return { ...s, conditionA: { ...s.conditionA, ...patch } };
        if (!s.conditionB) return s;
        return { ...s, conditionB: { ...s.conditionB, ...patch } };
      }),
    }));
  },

  addConditionB(stepId) {
    set((state) => ({
      steps: state.steps.map((s) =>
        s.id === stepId && s.kind === "waitAssert" ? { ...s, conditionB: defaultCondition() } : s
      ),
    }));
  },

  removeConditionB(stepId) {
    set((state) => ({
      steps: state.steps.map((s) => (s.id === stepId && s.kind === "waitAssert" ? { ...s, conditionB: null } : s)),
    }));
  },

  setConditionTagField(stepId, fieldPath, tagId) {
    set((state) => ({
      steps: state.steps.map((s) => {
        if (s.id !== stepId || s.kind !== "waitAssert") return s;
        if (fieldPath === "conditionA.tagId") return { ...s, conditionA: { ...s.conditionA, tagId } };
        if (fieldPath === "conditionA.expectedTagId") {
          return { ...s, conditionA: { ...s.conditionA, expectedTagId: tagId, expectedSource: "tag" } };
        }
        if (fieldPath === "conditionB.tagId" && s.conditionB) {
          return { ...s, conditionB: { ...s.conditionB, tagId } };
        }
        if (fieldPath === "conditionB.expectedTagId" && s.conditionB) {
          return { ...s, conditionB: { ...s.conditionB, expectedTagId: tagId, expectedSource: "tag" } };
        }
        return s;
      }),
    }));
  },

  setSteps(steps) {
    set({ steps });
  },
}));

export function createDefaultWriteStep(): WriteStep {
  return {
    id: crypto.randomUUID(),
    kind: "write",
    tagId: null,
    value: { type: "boolean", value: false },
    enabled: true,
  };
}

export function createDefaultWaitAssertStep(): WaitAssertStep {
  return {
    id: crypto.randomUUID(),
    kind: "waitAssert",
    conditionA: defaultCondition(),
    conditionB: null,
    combinator: "AND",
    timeoutMs: 5000,
    pollIntervalMs: 250,
    onTimeout: "fail",
    enabled: true,
  };
}

export function createDefaultDelayStep(): DelayStep {
  return { id: crypto.randomUUID(), kind: "delay", durationMs: 1000, enabled: true };
}
