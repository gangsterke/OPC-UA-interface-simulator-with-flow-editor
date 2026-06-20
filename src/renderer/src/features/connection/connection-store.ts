import { create } from "zustand";
import type { ConnectionProfile } from "@shared/models/connection-profile";
import type { ConnectionStatus } from "@shared/models/connection-status";

export const DEFAULT_CONNECTION_PROFILE: ConnectionProfile = {
  id: "default",
  name: "Default connection",
  endpointUrl: "opc.tcp://192.168.2.129:4840",
  securityPolicy: "None",
  securityMode: "None",
  authentication: { kind: "anonymous" },
};

interface ConnectionStoreState {
  profile: ConnectionProfile;
  status: ConnectionStatus;
  lastError: string | null;
  certificateRejected: boolean;
  initialized: boolean;
  init: () => Promise<void>;
  setProfile: (profile: ConnectionProfile) => void;
  connect: () => Promise<void>;
  disconnect: () => Promise<void>;
  dismissCertificateRejected: () => void;
}

export const useConnectionStore = create<ConnectionStoreState>((set, get) => ({
  profile: DEFAULT_CONNECTION_PROFILE,
  status: { state: "disconnected", updatedAt: new Date().toISOString() },
  lastError: null,
  certificateRejected: false,
  initialized: false,

  async init() {
    if (get().initialized) return;
    set({ initialized: true });
    const status = await window.api.connection.getStatus();
    set({ status });
    window.api.connection.onStatusChanged((status) => set({ status }));
  },

  setProfile(profile) {
    set({ profile });
  },

  async connect() {
    set({ lastError: null, certificateRejected: false });
    const result = await window.api.connection.connect(get().profile);
    if (!result.ok) {
      set({ lastError: result.error.message, certificateRejected: result.certificateRejected ?? false });
    }
  },

  async disconnect() {
    await window.api.connection.disconnect();
  },

  dismissCertificateRejected() {
    set({ certificateRejected: false });
  },
}));
