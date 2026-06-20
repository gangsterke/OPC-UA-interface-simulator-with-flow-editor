import { ipcMain, BrowserWindow } from "electron";
import { IpcChannels } from "@shared/ipc-channels";
import type { Project } from "@shared/models/project";
import { promptSaveProjectPath, promptOpenProjectPath, writeProjectFile, readProjectFile } from "../project/project-file-service";

export function registerProjectHandlers(): void {
  ipcMain.handle(IpcChannels.Project.Save, async (event, project: Project, filePath: string | null) => {
    const window = BrowserWindow.fromWebContents(event.sender);
    const resolvedPath = filePath ?? (await promptSaveProjectPath(window));
    if (!resolvedPath) {
      return { ok: false, canceled: true };
    }
    try {
      await writeProjectFile(project, resolvedPath);
      return { ok: true, filePath: resolvedPath };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) };
    }
  });

  ipcMain.handle(IpcChannels.Project.Open, async (event) => {
    const window = BrowserWindow.fromWebContents(event.sender);
    const filePath = await promptOpenProjectPath(window);
    if (!filePath) {
      return { ok: false, canceled: true };
    }
    try {
      const project = await readProjectFile(filePath);
      return { ok: true, project, filePath };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) };
    }
  });
}
