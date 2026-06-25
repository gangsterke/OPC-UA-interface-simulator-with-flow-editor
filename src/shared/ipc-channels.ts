export const IpcChannels = {
  App: {
    GetVersion: "app:getVersion",
  },
  Connection: {
    Connect: "connection:connect",
    Disconnect: "connection:disconnect",
    GetStatus: "connection:getStatus",
    StatusChanged: "connection:statusChanged",
  },
  Pki: {
    GetClientCertificateInfo: "pki:getClientCertificateInfo",
    ListTrustedServerCertificates: "pki:listTrustedServerCertificates",
    ListRejectedServerCertificates: "pki:listRejectedServerCertificates",
    TrustRejectedCertificate: "pki:trustRejectedCertificate",
    ExportClientCertificate: "pki:exportClientCertificate",
  },
  Browse: {
    ResolveRootNode: "browse:resolveRootNode",
    Children: "browse:children",
    ReadNodeAttributes: "browse:readNodeAttributes",
  },
  Tag: {
    ReadValue: "tag:readValue",
  },
  Method: {
    ReadArguments: "method:readArguments",
    TestCall: "method:testCall",
  },
  Run: {
    Start: "run:start",
    Cancel: "run:cancel",
    StepStarted: "run:stepStarted",
    StepProgress: "run:stepProgress",
    StepCompleted: "run:stepCompleted",
    Completed: "run:completed",
    Log: "run:log",
  },
  Project: {
    Save: "project:save",
    Open: "project:open",
  },
} as const;
