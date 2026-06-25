import { contextBridge, ipcRenderer } from "electron";
import { IpcChannels } from "@shared/ipc-channels";
import type { Api } from "@shared/ipc-contracts";
import type { ConnectionStatus } from "@shared/models/connection-status";
import type { TagNodeReference } from "@shared/models/tag";

function subscribe<T>(channel: string, callback: (payload: T) => void): () => void {
  const listener = (_event: unknown, payload: T): void => callback(payload);
  ipcRenderer.on(channel, listener);
  return () => ipcRenderer.removeListener(channel, listener);
}

const api: Api = {
  app: {
    getVersion: () => ipcRenderer.invoke(IpcChannels.App.GetVersion),
  },
  connection: {
    connect: (profile) => ipcRenderer.invoke(IpcChannels.Connection.Connect, profile),
    disconnect: () => ipcRenderer.invoke(IpcChannels.Connection.Disconnect),
    getStatus: () => ipcRenderer.invoke(IpcChannels.Connection.GetStatus),
    onStatusChanged: (callback: (status: ConnectionStatus) => void) =>
      subscribe(IpcChannels.Connection.StatusChanged, callback),
  },
  pki: {
    getClientCertificateInfo: () => ipcRenderer.invoke(IpcChannels.Pki.GetClientCertificateInfo),
    listTrustedServerCertificates: () => ipcRenderer.invoke(IpcChannels.Pki.ListTrustedServerCertificates),
    listRejectedServerCertificates: () => ipcRenderer.invoke(IpcChannels.Pki.ListRejectedServerCertificates),
    trustRejectedCertificate: (thumbprint: string) =>
      ipcRenderer.invoke(IpcChannels.Pki.TrustRejectedCertificate, thumbprint),
    exportClientCertificate: () => ipcRenderer.invoke(IpcChannels.Pki.ExportClientCertificate),
  },
  browse: {
    resolveRootNode: () => ipcRenderer.invoke(IpcChannels.Browse.ResolveRootNode),
    children: (nodeId: string) => ipcRenderer.invoke(IpcChannels.Browse.Children, nodeId),
    readNodeAttributes: (nodeId: string) => ipcRenderer.invoke(IpcChannels.Browse.ReadNodeAttributes, nodeId),
  },
  tag: {
    readValue: (reference: TagNodeReference) => ipcRenderer.invoke(IpcChannels.Tag.ReadValue, reference),
  },
  method: {
    readArguments: (objectNodeId: string, methodNodeId: string) =>
      ipcRenderer.invoke(IpcChannels.Method.ReadArguments, objectNodeId, methodNodeId),
    testCall: (method, inputArguments) => ipcRenderer.invoke(IpcChannels.Method.TestCall, method, inputArguments),
  },
  run: {
    start: (steps, tags, methods) => ipcRenderer.invoke(IpcChannels.Run.Start, { steps, tags, methods }),
    cancel: (runId: string) => ipcRenderer.invoke(IpcChannels.Run.Cancel, runId),
    onStepStarted: (callback) => subscribe(IpcChannels.Run.StepStarted, callback),
    onStepProgress: (callback) => subscribe(IpcChannels.Run.StepProgress, callback),
    onStepCompleted: (callback) => subscribe(IpcChannels.Run.StepCompleted, callback),
    onCompleted: (callback) => subscribe(IpcChannels.Run.Completed, callback),
    onLog: (callback) => subscribe(IpcChannels.Run.Log, callback),
  },
  project: {
    save: (project, filePath) => ipcRenderer.invoke(IpcChannels.Project.Save, project, filePath),
    open: () => ipcRenderer.invoke(IpcChannels.Project.Open),
  },
};

contextBridge.exposeInMainWorld("api", api);
