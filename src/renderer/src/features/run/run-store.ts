import { create } from "zustand";
import type { SequenceStep } from "@shared/models/sequence-step";
import type { Tag } from "@shared/models/tag";
import type { MethodDefinition } from "@shared/models/method";
import type { StepResult, RunSummary, RunLogLine } from "@shared/models/run-result";

interface RunStoreState {
  initialized: boolean;
  runId: string | null;
  isRunning: boolean;
  // True for the whole Run-to-Stop session, including the ~300ms pacing
  // pause between loop iterations - isRunning itself briefly goes false in
  // that gap (no iteration is actually in flight), which previously drove
  // the Run/Stop buttons directly and made them flicker on every loop cycle.
  // sessionActive instead only goes false once looping has truly ended.
  sessionActive: boolean;
  loopEnabled: boolean;
  loopIteration: number;
  currentStepIndex: number | null;
  stepResults: Record<string, StepResult>;
  log: RunLogLine[];
  lastSummary: RunSummary | null;
  lastError: string | null;
  lastSteps: SequenceStep[];
  lastTags: Tag[];
  lastMethods: MethodDefinition[];
  stopRequested: boolean;
  init: () => void;
  setLoopEnabled: (enabled: boolean) => void;
  start: (steps: SequenceStep[], tags: Tag[], methods: MethodDefinition[]) => Promise<void>;
  stop: () => Promise<void>;
}

export const useRunStore = create<RunStoreState>((set, get) => ({
  initialized: false,
  runId: null,
  isRunning: false,
  sessionActive: false,
  loopEnabled: false,
  loopIteration: 0,
  currentStepIndex: null,
  stepResults: {},
  log: [],
  lastSummary: null,
  lastError: null,
  lastSteps: [],
  lastTags: [],
  lastMethods: [],
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

      // Loop mode: automatically start the next iteration with the same
      // steps/tags/methods, unless the user pressed Stop - which always wins.
      // A short pacing pause keeps fast sequences (e.g. no Delay step,
      // condition already true) from cycling so quickly it just looks like flicker.
      const { loopEnabled, stopRequested, lastSteps, lastTags, lastMethods } = get();
      const willLoopAgain = loopEnabled && !stopRequested;
      set({ isRunning: false, sessionActive: willLoopAgain, currentStepIndex: null, lastSummary: summary });

      if (willLoopAgain) {
        set((state) => ({ loopIteration: state.loopIteration + 1 }));
        setTimeout(() => {
          if (get().loopEnabled && !get().stopRequested) {
            void get().start(lastSteps, lastTags, lastMethods);
          } else {
            set({ sessionActive: false });
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

  async start(steps, tags, methods) {
    set({
      // Set before the IPC round-trip (not after it resolves) so Run/Stop
      // grey out the instant the button is clicked, not after a perceptible
      // delay - this is what makes "Run" actually unclickable while a flow
      // is in progress instead of briefly still appearing available.
      isRunning: true,
      sessionActive: true,
      lastError: null,
      stepResults: {},
      log: [],
      lastSummary: null,
      currentStepIndex: null,
      lastSteps: steps,
      lastTags: tags,
      lastMethods: methods,
      stopRequested: false,
    });
    if (get().loopIteration === 0) set({ loopIteration: 1 });
    try {
      const { runId } = await window.api.run.start(steps, tags, methods);
      set({ runId });
    } catch (err) {
      set({ isRunning: false, sessionActive: false, lastError: err instanceof Error ? err.message : String(err) });
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
        set({ isRunning: false, sessionActive: false, currentStepIndex: null, lastError: "Run did not respond to Stop in time" });
      }
    }, 5000);
  },
}));
