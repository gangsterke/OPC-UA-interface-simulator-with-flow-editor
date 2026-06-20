import { app, BrowserWindow, ipcMain } from "electron";
import { join } from "node:path";
import { IpcChannels } from "@shared/ipc-channels";
import log from "./logger";
import { createClientCertificateManager } from "./opcua/certificate-service";
import { OpcUaService } from "./opcua/opcua-service";
import { registerConnectionHandlers } from "./ipc/connection-handlers";
import { registerPkiHandlers } from "./ipc/pki-handlers";
import { registerBrowseHandlers } from "./ipc/browse-handlers";
import { registerTagHandlers } from "./ipc/tag-handlers";
import { registerRunHandlers } from "./ipc/run-handlers";
import { registerProjectHandlers } from "./ipc/project-handlers";
import { RunEngine } from "./execution/run-engine";

function getIconPath(): string {
  // build/ isn't part of the packaged asar - electron-builder copies it to
  // resources/icon.png separately (see extraResources in electron-builder.yml).
  return app.isPackaged
    ? join(process.resourcesPath, "icon.png")
    : join(__dirname, "../../build/icon.png");
}

function createWindow(): void {
  const mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    show: false,
    icon: getIconPath(),
    webPreferences: {
      preload: join(__dirname, "../preload/index.js"),
      sandbox: false,
    },
  });

  mainWindow.on("ready-to-show", () => {
    mainWindow.show();
  });

  mainWindow.webContents.on("render-process-gone", (_event, details) => {
    log.error("Renderer process gone:", details.reason);
  });

  const rendererUrl = process.env["ELECTRON_RENDERER_URL"];
  if (!app.isPackaged && rendererUrl) {
    mainWindow.loadURL(rendererUrl);
  } else {
    mainWindow.loadFile(join(__dirname, "../renderer/index.html"));
  }
}

app.whenReady().then(async () => {
  log.info("App starting", {
    version: app.getVersion(),
    packaged: app.isPackaged,
    userDataPath: app.getPath("userData"),
  });

  const certificateManager = await createClientCertificateManager(join(app.getPath("userData"), "pki"));
  const opcUaService = new OpcUaService(certificateManager);
  const runEngine = new RunEngine();

  opcUaService.on("statusChanged", (status) => log.info("Connection status:", status.state, status.error?.message ?? ""));
  runEngine.on("log", (entry) => log.info(`[run ${entry.runId}]`, entry.message));

  ipcMain.handle(IpcChannels.App.GetVersion, () => app.getVersion());
  registerConnectionHandlers(opcUaService);
  registerPkiHandlers(certificateManager);
  registerBrowseHandlers(opcUaService);
  registerTagHandlers(opcUaService);
  registerRunHandlers(opcUaService, runEngine);
  registerProjectHandlers();

  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});
