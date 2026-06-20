import { ipcMain } from "electron";
import { IpcChannels } from "@shared/ipc-channels";
import { resolveRootNode, browseChildren, readNodeAttributes } from "../opcua/browse-service";
import { OpcUaService } from "../opcua/opcua-service";

function requireSession(opcUaService: OpcUaService) {
  const session = opcUaService.getActiveSession();
  if (!session) {
    throw new Error("Not connected to an OPC UA server");
  }
  return session;
}

export function registerBrowseHandlers(opcUaService: OpcUaService): void {
  ipcMain.handle(IpcChannels.Browse.ResolveRootNode, () => resolveRootNode());

  ipcMain.handle(IpcChannels.Browse.Children, async (_event, nodeId: string) => {
    return browseChildren(requireSession(opcUaService), nodeId);
  });

  ipcMain.handle(IpcChannels.Browse.ReadNodeAttributes, async (_event, nodeId: string) => {
    return readNodeAttributes(requireSession(opcUaService), nodeId);
  });
}
