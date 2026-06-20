/// <reference types="vite/client" />

import type { Api } from "@shared/ipc-contracts";

declare global {
  interface Window {
    api: Api;
  }
}
