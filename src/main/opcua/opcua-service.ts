import { EventEmitter } from "node:events";
import {
  OPCUAClient,
  MessageSecurityMode,
  SecurityPolicy as NodeOpcuaSecurityPolicy,
  UserTokenType,
  type ClientSession,
  type OPCUACertificateManager,
} from "node-opcua";
import type {
  ConnectionProfile,
  SecurityMode,
  SecurityPolicy,
} from "@shared/models/connection-profile";
import type { ConnectionStatus } from "@shared/models/connection-status";

const SECURITY_MODE_MAP: Record<SecurityMode, MessageSecurityMode> = {
  None: MessageSecurityMode.None,
  Sign: MessageSecurityMode.Sign,
  SignAndEncrypt: MessageSecurityMode.SignAndEncrypt,
};

const SECURITY_POLICY_MAP: Record<SecurityPolicy, NodeOpcuaSecurityPolicy> = {
  None: NodeOpcuaSecurityPolicy.None,
  Basic128Rsa15: NodeOpcuaSecurityPolicy.Basic128Rsa15,
  Basic256: NodeOpcuaSecurityPolicy.Basic256,
  Basic256Sha256: NodeOpcuaSecurityPolicy.Basic256Sha256,
  Aes128_Sha256_RsaOaep: NodeOpcuaSecurityPolicy.Aes128_Sha256_RsaOaep,
  Aes256_Sha256_RsaPss: NodeOpcuaSecurityPolicy.Aes256_Sha256_RsaPss,
};

function toUserIdentityInfo(profile: ConnectionProfile) {
  if (profile.authentication.kind === "usernamePassword") {
    return {
      type: UserTokenType.UserName,
      userName: profile.authentication.username,
      password: profile.authentication.password,
    } as const;
  }
  return undefined; // node-opcua defaults to an anonymous identity token when omitted
}

// Owns a single OPCUAClient+session pair at a time, matching the "test one
// interface" use case (see plan section 4.1) - no need for multi-connection support.
// Deliberately has no Electron dependency (BrowserWindow/ipcMain) so it stays
// unit-testable in isolation; ipc/connection-handlers.ts is the only thing that
// bridges its `statusChanged` events to the renderer.
export class OpcUaService extends EventEmitter {
  private client: OPCUAClient | null = null;
  private session: ClientSession | null = null;
  private status: ConnectionStatus = { state: "disconnected", updatedAt: new Date().toISOString() };
  private explicitDisconnect = false;

  constructor(private readonly certificateManager: OPCUACertificateManager) {
    super();
  }

  getStatus(): ConnectionStatus {
    return this.status;
  }

  getActiveSession(): ClientSession | null {
    return this.session;
  }

  async connect(profile: ConnectionProfile): Promise<void> {
    if (this.client) {
      await this.disconnect();
    }

    this.explicitDisconnect = false;
    this.setStatus({ state: "connecting", endpointUrl: profile.endpointUrl });

    const client = OPCUAClient.create({
      endpointMustExist: false,
      securityMode: SECURITY_MODE_MAP[profile.securityMode],
      securityPolicy: SECURITY_POLICY_MAP[profile.securityPolicy],
      clientCertificateManager: this.certificateManager,
      connectionStrategy: { maxRetry: 5, initialDelay: 1000, maxDelay: 10000 },
    });

    // node-opcua owns transport-level reconnection/backoff; we just translate
    // its lifecycle events into our own ConnectionStatus (plan section 4.1).
    client.on("connection_lost", () => {
      this.setStatus({ state: "reconnecting", endpointUrl: profile.endpointUrl });
    });
    client.on("connection_reestablished", () => {
      this.setStatus({ state: "connected", endpointUrl: profile.endpointUrl });
    });
    client.on("close", () => {
      if (!this.explicitDisconnect) {
        this.setStatus({ state: "disconnected", endpointUrl: profile.endpointUrl });
      }
    });

    try {
      await client.connect(profile.endpointUrl);
      const session = await client.createSession(toUserIdentityInfo(profile));
      this.client = client;
      this.session = session;
      this.setStatus({ state: "connected", endpointUrl: profile.endpointUrl });
    } catch (err) {
      await client.disconnect().catch(() => {});
      this.client = null;
      this.session = null;
      const message = err instanceof Error ? err.message : String(err);
      this.setStatus({ state: "error", endpointUrl: profile.endpointUrl, error: { message } });
      throw err;
    }
  }

  async disconnect(): Promise<void> {
    if (!this.client) {
      this.setStatus({ state: "disconnected" });
      return;
    }
    this.explicitDisconnect = true;
    this.setStatus({ state: "disconnecting" });
    const { client, session } = this;
    this.client = null;
    this.session = null;
    if (session) {
      await session.close().catch(() => {});
    }
    await client.disconnect().catch(() => {});
    this.setStatus({ state: "disconnected" });
  }

  private setStatus(partial: Omit<ConnectionStatus, "updatedAt">): void {
    this.status = { ...partial, updatedAt: new Date().toISOString() };
    this.emit("statusChanged", this.status);
  }
}
