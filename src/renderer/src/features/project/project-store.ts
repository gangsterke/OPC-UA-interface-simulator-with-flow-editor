import { create } from "zustand";
import { useConnectionStore, DEFAULT_CONNECTION_PROFILE } from "../connection/connection-store";
import { useTagsStore } from "../tags/tags-store";
import { useSequenceStore } from "../sequence/sequence-store";
import type { Project, ProjectMetadata } from "@shared/models/project";

const SCHEMA_VERSION = 1;

interface ProjectStoreState {
  filePath: string | null;
  isDirty: boolean;
  lastError: string | null;
  lastMetadata: ProjectMetadata | null;
  initialized: boolean;
  init: () => void;
  newProject: () => void;
  save: () => Promise<void>;
  saveAs: () => Promise<void>;
  open: () => Promise<void>;
}

// Suppresses dirty-tracking while a project is being applied wholesale
// (new/open), since that itself mutates the underlying stores.
let suppressDirty = false;

async function buildProject(lastMetadata: ProjectMetadata | null): Promise<Project> {
  const now = new Date().toISOString();
  const appVersionAtSave = await window.api.app.getVersion();
  return {
    metadata: {
      schemaVersion: SCHEMA_VERSION,
      createdAt: lastMetadata?.createdAt ?? now,
      modifiedAt: now,
      appVersionAtSave,
    },
    connectionProfile: useConnectionStore.getState().profile,
    tags: useTagsStore.getState().tags,
    sequence: useSequenceStore.getState().steps,
  };
}

function applyProject(project: Project): void {
  useConnectionStore.getState().setProfile(project.connectionProfile);
  useTagsStore.getState().setTags(project.tags);
  useSequenceStore.getState().setSteps(project.sequence);
}

export const useProjectStore = create<ProjectStoreState>((set, get) => ({
  filePath: null,
  isDirty: false,
  lastError: null,
  lastMetadata: null,
  initialized: false,

  init() {
    if (get().initialized) return;
    set({ initialized: true });

    useConnectionStore.subscribe((state, prev) => {
      if (!suppressDirty && state.profile !== prev.profile) set({ isDirty: true });
    });
    useTagsStore.subscribe((state, prev) => {
      if (!suppressDirty && state.tags !== prev.tags) set({ isDirty: true });
    });
    useSequenceStore.subscribe((state, prev) => {
      if (!suppressDirty && state.steps !== prev.steps) set({ isDirty: true });
    });
  },

  newProject() {
    suppressDirty = true;
    useConnectionStore.getState().setProfile(DEFAULT_CONNECTION_PROFILE);
    useTagsStore.getState().setTags([]);
    useSequenceStore.getState().setSteps([]);
    suppressDirty = false;
    set({ filePath: null, isDirty: false, lastMetadata: null, lastError: null });
  },

  async save() {
    const project = await buildProject(get().lastMetadata);
    const result = await window.api.project.save(project, get().filePath);
    if (!result.ok) {
      if (!result.canceled) set({ lastError: result.error ?? "Save failed" });
      return;
    }
    set({ filePath: result.filePath, isDirty: false, lastMetadata: project.metadata, lastError: null });
  },

  async saveAs() {
    const project = await buildProject(get().lastMetadata);
    const result = await window.api.project.save(project, null);
    if (!result.ok) {
      if (!result.canceled) set({ lastError: result.error ?? "Save failed" });
      return;
    }
    set({ filePath: result.filePath, isDirty: false, lastMetadata: project.metadata, lastError: null });
  },

  async open() {
    const result = await window.api.project.open();
    if (!result.ok) {
      if (!result.canceled) set({ lastError: result.error ?? "Open failed" });
      return;
    }
    suppressDirty = true;
    applyProject(result.project);
    suppressDirty = false;
    set({
      filePath: result.filePath,
      isDirty: false,
      lastMetadata: result.project.metadata,
      lastError: null,
    });
  },
}));
