import { create } from "zustand";
import type { SequenceStep } from "@shared/models/sequence-step";
import type { Tag } from "@shared/models/tag";
import type { StepResult, RunSummary, RunLogLine } from "@shared/models/run-result";

interface RunStoreState {
  initialized: boolean;
  runId: string | null;
  isRunning: boolean;
  loopEnabled: boolean;
  loopIteration: number;
  currentStepIndex: number | null;
  stepResults: Record<string, StepResult>;
  log: RunLogLine[];
  lastSummary: RunSummary | null;
  lastError: string | null;
  lastSteps: SequenceStep[];
  lastTags: Tag[];
  stopRequested: boolean;
  init: () => void;
  setLoopEnabled: (enabled: boolean) => void;
  start: (steps: SequenceStep[], tags: Tag[]) => Promise<void>;
  stop: () => Promise<void>;
}

export const useRunStore = create<RunStoreState>((set, get) => ({
  initialized: false,
  runId: null,
  isRunning: false,
  loopEnabled: false,
  loopIteration: 0,
  currentStepIndex: null,
  stepResults: {},
  log: [],
  lastSummary: null,
  lastError: null,
  lastSteps: [],
  lastTags: [],
  stopRequested: false,

  init() {
    if (get().initialized) return;
    set({ initialized: true });

    // Stale events from a previous/cancelled run are filtered by runId so a
    // late-arriving event never corrupts the currently-displayed run.
    window.api.run.onStepStarted(({ runId, stepIndex }) => {
      if (runId !== get().runId) return;
      set({ currentStepIndex: stepIndex });
    });

    window.api.run.onStepCompleted(({ runId, result }) => {
      if (runId !== get().runId) return;
      set((state) => ({ stepResults: { ...state.stepResults, [result.stepId]: result } }));
    });

    window.api.run.onCompleted(({ runId, summary }) => {
      if (runId !== get().runId) return;
      set({ isRunning: false, currentStepIndex: null, lastSummary: summary });

      // Loop mode: automatically start the next iteration with the same
      // steps/tags, unless the user pressed Stop - which always wins. A short
      // pacing pause keeps fast sequences (e.g. no Delay step, condition
      // already true) from cycling so quickly it just looks like flicker.
      const { loopEnabled, stopRequested, lastSteps, lastTags } = get();
      if (loopEnabled && !stopRequested) {
        set((state) => ({ loopIteration: state.loopIteration + 1 }));
        setTimeout(() => {
          if (get().loopEnabled && !get().stopRequested) {
            void get().start(lastSteps, lastTags);
          }
        }, 300);
      }
    });

    window.api.run.onLog((line) => {
      if (line.runId !== get().runId) return;
      set((state) => ({ log: [...state.log, line] }));
    });
  },

  setLoopEnabled(enabled) {
    set({ loopEnabled: enabled });
  },

  async start(steps, tags) {
    set({
      lastError: null,
      stepResults: {},
      log: [],
      lastSummary: null,
      currentStepIndex: null,
      lastSteps: steps,
      lastTags: tags,
      stopRequested: false,
    });
    if (get().loopIteration === 0) set({ loopIteration: 1 });
    try {
      const { runId } = await window.api.run.start(steps, tags);
      set({ runId, isRunning: true });
    } catch (err) {
      set({ lastError: err instanceof Error ? err.message : String(err) });
    }
  },

  async stop() {
    set({ stopRequested: true, loopIteration: 0 });
    const { runId } = get();
    if (runId) {
      await window.api.run.cancel(runId);
    }
    // Safety net: the main process should always emit "completed" shortly
    // after a cancel, but if some future bug ever stalls that, don't leave
    // the UI permanently stuck unable to start a new run.
    setTimeout(() => {
      if (get().runId === runId && get().isRunning) {
        set({ isRunning: false, currentStepIndex: null, lastError: "Run did not respond to Stop in time" });
      }
    }, 5000);
  },
}));
