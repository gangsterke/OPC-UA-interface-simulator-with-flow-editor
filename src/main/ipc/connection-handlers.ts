import { ipcMain, BrowserWindow } from "electron";
import { IpcChannels } from "@shared/ipc-channels";
import type { ConnectionProfile } from "@shared/models/connection-profile";
import type { ConnectResult } from "@shared/ipc-contracts";
import { OpcUaService } from "../opcua/opcua-service";

export function registerConnectionHandlers(opcUaService: OpcUaService): void {
  ipcMain.handle(IpcChannels.Connection.Connect, async (_event, profile: ConnectionProfile): Promise<ConnectResult> => {
    try {
      await opcUaService.connect(profile);
      return { ok: true };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      const certificateRejected = message.includes("BadCertificateUntrusted");
      return { ok: false, error: { message }, certificateRejected };
    }
  });

  ipcMain.handle(IpcChannels.Connection.Disconnect, async () => {
    await opcUaService.disconnect();
    return { ok: true } as const;
  });

  ipcMain.handle(IpcChannels.Connection.GetStatus, () => opcUaService.getStatus());

  opcUaService.on("statusChanged", (status) => {
    for (const window of BrowserWindow.getAllWindows()) {
      window.webContents.send(IpcChannels.Connection.StatusChanged, status);
    }
  });
}
