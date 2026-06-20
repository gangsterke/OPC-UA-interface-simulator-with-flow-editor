import { ipcMain, dialog, BrowserWindow } from "electron";
import type { OPCUACertificateManager } from "node-opcua";
import { IpcChannels } from "@shared/ipc-channels";
import {
  getClientCertificateInfo,
  listTrustedServerCertificates,
  listRejectedServerCertificates,
  trustRejectedCertificateByThumbprint,
  exportClientCertificate,
} from "../opcua/certificate-service";

export function registerPkiHandlers(certificateManager: OPCUACertificateManager): void {
  ipcMain.handle(IpcChannels.Pki.GetClientCertificateInfo, () => getClientCertificateInfo(certificateManager));
  ipcMain.handle(IpcChannels.Pki.ListTrustedServerCertificates, () =>
    listTrustedServerCertificates(certificateManager)
  );
  ipcMain.handle(IpcChannels.Pki.ListRejectedServerCertificates, () =>
    listRejectedServerCertificates(certificateManager)
  );

  ipcMain.handle(IpcChannels.Pki.TrustRejectedCertificate, async (_event, thumbprint: string) => {
    const ok = await trustRejectedCertificateByThumbprint(certificateManager, thumbprint);
    return { ok };
  });

  // The PLC side of trust can't be automated from here - this just gets the
  // client's own certificate onto disk so the user can hand it to whoever
  // administers the PLC (e.g. to import into TIA Portal's security config).
  ipcMain.handle(IpcChannels.Pki.ExportClientCertificate, async (event) => {
    const window = BrowserWindow.fromWebContents(event.sender);
    const dialogOptions = {
      title: "Export client certificate",
      defaultPath: "interface-simulator-client.der",
      filters: [{ name: "DER certificate", extensions: ["der"] }],
    };
    const result = window
      ? await dialog.showSaveDialog(window, dialogOptions)
      : await dialog.showSaveDialog(dialogOptions);
    if (result.canceled || !result.filePath) {
      return { ok: false, canceled: true };
    }
    await exportClientCertificate(certificateManager, result.filePath);
    return { ok: true, filePath: result.filePath };
  });
}
