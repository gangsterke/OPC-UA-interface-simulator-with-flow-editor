import type { ConnectionProfile } from "./models/connection-profile";
import type { ConnectionStatus } from "./models/connection-status";
import type { CertificateSummary } from "./models/certificate-summary";
import type { BrowseTreeNode } from "./models/browse-tree-node";
import type { NodeAttributesSummary, TagValueDto } from "./models/node-attributes";
import type { Tag, TagNodeReference } from "./models/tag";
import type { SequenceStep, TagLiteralValue } from "./models/sequence-step";
import type { StepResult, RunSummary, RunLogLine } from "./models/run-result";
import type { Project } from "./models/project";
import type { MethodArgumentMeta, MethodDefinition } from "./models/method";

export type ConnectResult =
  | { ok: true }
  | { ok: false; error: { message: string }; certificateRejected?: boolean };

export interface Api {
  app: {
    getVersion: () => Promise<string>;
  };
  connection: {
    connect: (profile: ConnectionProfile) => Promise<ConnectResult>;
    disconnect: () => Promise<{ ok: true }>;
    getStatus: () => Promise<ConnectionStatus>;
    onStatusChanged: (callback: (status: ConnectionStatus) => void) => () => void;
  };
  pki: {
    getClientCertificateInfo: () => Promise<CertificateSummary | null>;
    listTrustedServerCertificates: () => Promise<CertificateSummary[]>;
    listRejectedServerCertificates: () => Promise<CertificateSummary[]>;
    trustRejectedCertificate: (thumbprint: string) => Promise<{ ok: boolean }>;
    exportClientCertificate: () => Promise<{ ok: boolean; filePath?: string; canceled?: boolean }>;
  };
  browse: {
    resolveRootNode: () => Promise<BrowseTreeNode>;
    children: (nodeId: string) => Promise<BrowseTreeNode[]>;
    readNodeAttributes: (nodeId: string) => Promise<NodeAttributesSummary>;
  };
  tag: {
    readValue: (reference: TagNodeReference) => Promise<TagValueDto>;
  };
  method: {
    readArguments: (
      objectNodeId: string,
      methodNodeId: string
    ) => Promise<{
      objectNode: TagNodeReference;
      methodNode: TagNodeReference;
      inputArguments: MethodArgumentMeta[];
      outputArguments: MethodArgumentMeta[];
    }>;
    testCall: (
      method: MethodDefinition,
      inputArguments: TagLiteralValue[]
    ) => Promise<
      | { ok: true; outputs: { name: string; display: string }[] }
      | { ok: false; error: string }
    >;
  };
  run: {
    start: (steps: SequenceStep[], tags: Tag[], methods: MethodDefinition[]) => Promise<{ runId: string }>;
    cancel: (runId: string) => Promise<{ ok: boolean }>;
    onStepStarted: (callback: (event: { runId: string; stepIndex: number; step: SequenceStep }) => void) => () => void;
    onStepProgress: (
      callback: (event: { runId: string; stepIndex: number; elapsedMs: number; lastValue?: unknown }) => void
    ) => () => void;
    onStepCompleted: (
      callback: (event: { runId: string; stepIndex: number; result: StepResult }) => void
    ) => () => void;
    onCompleted: (callback: (event: { runId: string; summary: RunSummary }) => void) => () => void;
    onLog: (callback: (event: RunLogLine & { runId: string }) => void) => () => void;
  };
  project: {
    // filePath: the caller's remembered path for a plain Save, or null to
    // always prompt (Save As, or first save with no remembered path yet).
    save: (
      project: Project,
      filePath: string | null
    ) => Promise<{ ok: true; filePath: string } | { ok: false; canceled?: boolean; error?: string }>;
    open: () => Promise<
      { ok: true; project: Project; filePath: string } | { ok: false; canceled?: boolean; error?: string }
    >;
  };
}
