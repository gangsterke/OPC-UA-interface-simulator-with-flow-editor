import { create } from "zustand";
import type {
  SequenceStep,
  WriteStep,
  WaitAssertStep,
  DelayStep,
  WaitCondition,
  CallMethodStep,
  MethodArgumentValueSource,
} from "@shared/models/sequence-step";
import type { MethodDefinition } from "@shared/models/method";
import { literalKindForDataType, defaultLiteralForKind } from "./literal-value";

type StepPatch = Partial<WriteStep> | Partial<WaitAssertStep> | Partial<DelayStep> | Partial<CallMethodStep>;

function defaultArgumentSource(dataType: Parameters<typeof literalKindForDataType>[0]): MethodArgumentValueSource {
  return { source: "constant", value: defaultLiteralForKind(literalKindForDataType(dataType)) };
}

function defaultCondition(): WaitCondition {
  return {
    subjectSource: "tag",
    tagId: null,
    methodSubject: { methodId: null, methodOutputIndex: 0, methodInputArguments: [] },
    comparison: "equals",
    expectedSource: "constant",
    expectedValue: { type: "boolean", value: true },
    expectedTagId: null,
    expectedStepOutput: null,
  };
}

interface SequenceStoreState {
  steps: SequenceStep[];
  addStep: (step: SequenceStep) => void;
  removeStep: (id: string) => void;
  updateStep: (id: string, patch: StepPatch) => void;
  reorderSteps: (orderedIds: string[]) => void;
  setStepTag: (id: string, tagId: string) => void;
  setWriteValueTagSource: (id: string, tagId: string) => void;
  updateCondition: (stepId: string, which: "A" | "B", patch: Partial<WaitCondition>) => void;
  addConditionB: (stepId: string) => void;
  removeConditionB: (stepId: string) => void;
  // fieldPath: "conditionA.tagId" | "conditionA.expectedTagId" | "conditionB.tagId" | "conditionB.expectedTagId"
  setConditionTagField: (stepId: string, fieldPath: string, tagId: string) => void;
  setSteps: (steps: SequenceStep[]) => void;
  setStepMethod: (stepId: string, method: MethodDefinition) => void;
  setInputArgumentSource: (stepId: string, argumentIndex: number, source: MethodArgumentValueSource) => void;
  setConditionMethod: (stepId: string, which: "A" | "B", method: MethodDefinition) => void;
  setConditionMethodInputSource: (
    stepId: string,
    which: "A" | "B",
    argumentIndex: number,
    source: MethodArgumentValueSource
  ) => void;
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

  setWriteValueTagSource(id, tagId) {
    set((state) => ({
      steps: state.steps.map((s) =>
        s.id === id && s.kind === "write" ? { ...s, value: { source: "tag", tagId, fieldPath: [] } } : s
      ),
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

  setStepMethod(stepId, method) {
    set((state) => ({
      steps: state.steps.map((s) =>
        s.id === stepId && s.kind === "callMethod"
          ? {
              ...s,
              methodId: method.id,
              inputArguments: method.inputArguments.map((arg) => defaultArgumentSource(arg.dataType)),
            }
          : s
      ),
    }));
  },

  setInputArgumentSource(stepId, argumentIndex, source) {
    set((state) => ({
      steps: state.steps.map((s) => {
        if (s.id !== stepId || s.kind !== "callMethod") return s;
        const inputArguments = [...s.inputArguments];
        inputArguments[argumentIndex] = source;
        return { ...s, inputArguments };
      }),
    }));
  },

  setConditionMethod(stepId, which, method) {
    const methodSubject = {
      methodId: method.id,
      methodOutputIndex: 0,
      methodInputArguments: method.inputArguments.map((arg) => defaultArgumentSource(arg.dataType)),
    };
    // Re-syncs the comparison's literal kind to the newly selected method's
    // first output - without this, switching from a tag (whose dataType
    // happened to default the literal to e.g. boolean) to a Float-returning
    // method leaves a stale boolean checkbox with no way to enter a number.
    const expectedKind = literalKindForDataType(method.outputArguments[0]?.dataType);
    set((state) => ({
      steps: state.steps.map((s) => {
        if (s.id !== stepId || s.kind !== "waitAssert") return s;
        const apply = (condition: WaitCondition): WaitCondition => {
          if (condition.expectedSource !== "constant" || expectedKind === condition.expectedValue.type) {
            return { ...condition, methodSubject };
          }
          return { ...condition, methodSubject, expectedValue: defaultLiteralForKind(expectedKind) };
        };
        if (which === "A") return { ...s, conditionA: apply(s.conditionA) };
        if (!s.conditionB) return s;
        return { ...s, conditionB: apply(s.conditionB) };
      }),
    }));
  },

  setConditionMethodInputSource(stepId, which, argumentIndex, source) {
    set((state) => ({
      steps: state.steps.map((s) => {
        if (s.id !== stepId || s.kind !== "waitAssert") return s;
        const condition = which === "A" ? s.conditionA : s.conditionB;
        if (!condition) return s;
        const methodInputArguments = [...condition.methodSubject.methodInputArguments];
        methodInputArguments[argumentIndex] = source;
        const updated = { ...condition, methodSubject: { ...condition.methodSubject, methodInputArguments } };
        return which === "A" ? { ...s, conditionA: updated } : { ...s, conditionB: updated };
      }),
    }));
  },
}));

export function createDefaultWriteStep(): WriteStep {
  return {
    id: crypto.randomUUID(),
    kind: "write",
    tagId: null,
    value: { source: "constant", value: { type: "boolean", value: false } },
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

export function createDefaultCallMethodStep(): CallMethodStep {
  return { id: crypto.randomUUID(), kind: "callMethod", methodId: null, inputArguments: [], enabled: true };
}
