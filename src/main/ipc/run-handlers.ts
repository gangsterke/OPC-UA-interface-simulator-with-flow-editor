import { ipcMain, BrowserWindow } from "electron";
import { IpcChannels } from "@shared/ipc-channels";
import type { SequenceStep } from "@shared/models/sequence-step";
import type { Tag } from "@shared/models/tag";
import type { MethodDefinition } from "@shared/models/method";
import { RunEngine } from "../execution/run-engine";
import { OpcUaService } from "../opcua/opcua-service";

function broadcast(channel: string, payload: unknown): void {
  for (const window of BrowserWindow.getAllWindows()) {
    window.webContents.send(channel, payload);
  }
}

export function registerRunHandlers(opcUaService: OpcUaService, runEngine: RunEngine): void {
  ipcMain.handle(
    IpcChannels.Run.Start,
    async (_event, request: { steps: SequenceStep[]; tags: Tag[]; methods: MethodDefinition[] }) => {
      const session = opcUaService.getActiveSession();
      if (!session) {
        throw new Error("Not connected to an OPC UA server");
      }
      const runId = await runEngine.startRun(session, request.steps, request.tags, request.methods);
      return { runId };
    }
  );

  ipcMain.handle(IpcChannels.Run.Cancel, (_event, runId: string) => {
    return { ok: runEngine.cancel(runId) };
  });

  runEngine.on("stepStarted", (payload) => broadcast(IpcChannels.Run.StepStarted, payload));
  runEngine.on("stepProgress", (payload) => broadcast(IpcChannels.Run.StepProgress, payload));
  runEngine.on("stepCompleted", (payload) => broadcast(IpcChannels.Run.StepCompleted, payload));
  runEngine.on("completed", (payload) => broadcast(IpcChannels.Run.Completed, payload));
  runEngine.on("log", (payload) => broadcast(IpcChannels.Run.Log, payload));
}
