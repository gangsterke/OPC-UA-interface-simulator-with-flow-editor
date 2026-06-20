import { ipcMain } from "electron";
import { IpcChannels } from "@shared/ipc-channels";
import type { TagNodeReference } from "@shared/models/tag";
import { readTagValue } from "../opcua/tag-service";
import { OpcUaService } from "../opcua/opcua-service";

export function registerTagHandlers(opcUaService: OpcUaService): void {
  ipcMain.handle(IpcChannels.Tag.ReadValue, async (_event, reference: TagNodeReference) => {
    const session = opcUaService.getActiveSession();
    if (!session) {
      throw new Error("Not connected to an OPC UA server");
    }
    return readTagValue(session, reference);
  });
}
