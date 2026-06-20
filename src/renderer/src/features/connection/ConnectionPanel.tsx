import { useConnectionStore } from "./connection-store";
import { CertificateManagerPanel } from "../certificates/CertificateManagerPanel";
import type {
  AuthenticationMode,
  ConnectionProfile,
  SecurityMode,
  SecurityPolicy,
} from "@shared/models/connection-profile";

const SECURITY_POLICIES: SecurityPolicy[] = [
  "None",
  "Basic128Rsa15",
  "Basic256",
  "Basic256Sha256",
  "Aes128_Sha256_RsaOaep",
  "Aes256_Sha256_RsaPss",
];

const SECURITY_MODES: SecurityMode[] = ["None", "Sign", "SignAndEncrypt"];

export function ConnectionPanel() {
  const status = useConnectionStore((s) => s.status);
  const lastError = useConnectionStore((s) => s.lastError);
  const profile = useConnectionStore((s) => s.profile);
  const setProfile = useConnectionStore((s) => s.setProfile);
  const connect = useConnectionStore((s) => s.connect);
  const disconnect = useConnectionStore((s) => s.disconnect);

  const authKind = profile.authentication.kind;
  const username = profile.authentication.kind === "usernamePassword" ? profile.authentication.username : "";
  const password = profile.authentication.kind === "usernamePassword" ? profile.authentication.password : "";

  const busy = status.state === "connecting" || status.state === "disconnecting";
  const isConnected = status.state === "connected" || status.state === "reconnecting";
  const fieldsDisabled = isConnected || busy;

  function patch(fields: Partial<ConnectionProfile>): void {
    setProfile({ ...profile, ...fields });
  }

  function setAuthKind(kind: "anonymous" | "usernamePassword"): void {
    const authentication: AuthenticationMode =
      kind === "usernamePassword" ? { kind, username: "", password: "" } : { kind: "anonymous" };
    patch({ authentication });
  }

  function setUsername(value: string): void {
    if (profile.authentication.kind === "usernamePassword") {
      patch({ authentication: { ...profile.authentication, username: value } });
    }
  }

  function setPassword(value: string): void {
    if (profile.authentication.kind === "usernamePassword") {
      patch({ authentication: { ...profile.authentication, password: value } });
    }
  }

  return (
    <fieldset style={{ border: "1px solid #ccc", borderRadius: 8, padding: 16, maxWidth: 480 }}>
      <legend>OPC UA Connection</legend>

      <label style={{ display: "block", marginBottom: 8 }}>
        Endpoint URL
        <input
          style={{ display: "block", width: "100%" }}
          value={profile.endpointUrl}
          disabled={fieldsDisabled}
          onChange={(e) => patch({ endpointUrl: e.target.value })}
          placeholder="opc.tcp://host:4840"
        />
      </label>

      <label style={{ display: "block", marginBottom: 8 }}>
        Security Policy
        <select
          style={{ display: "block", width: "100%" }}
          value={profile.securityPolicy}
          disabled={fieldsDisabled}
          onChange={(e) => patch({ securityPolicy: e.target.value as SecurityPolicy })}
        >
          {SECURITY_POLICIES.map((policy) => (
            <option key={policy} value={policy}>
              {policy}
            </option>
          ))}
        </select>
      </label>

      <label style={{ display: "block", marginBottom: 8 }}>
        Security Mode
        <select
          style={{ display: "block", width: "100%" }}
          value={profile.securityMode}
          disabled={fieldsDisabled}
          onChange={(e) => patch({ securityMode: e.target.value as SecurityMode })}
        >
          {SECURITY_MODES.map((mode) => (
            <option key={mode} value={mode}>
              {mode}
            </option>
          ))}
        </select>
      </label>

      <label style={{ display: "block", marginBottom: 8 }}>
        Authentication
        <select
          style={{ display: "block", width: "100%" }}
          value={authKind}
          disabled={fieldsDisabled}
          onChange={(e) => setAuthKind(e.target.value as "anonymous" | "usernamePassword")}
        >
          <option value="anonymous">Anonymous</option>
          <option value="usernamePassword">Username / Password</option>
        </select>
      </label>

      {authKind === "usernamePassword" && (
        <>
          <label style={{ display: "block", marginBottom: 8 }}>
            Username
            <input
              style={{ display: "block", width: "100%" }}
              value={username}
              disabled={fieldsDisabled}
              onChange={(e) => setUsername(e.target.value)}
            />
          </label>
          <label style={{ display: "block", marginBottom: 8 }}>
            Password
            <input
              type="password"
              style={{ display: "block", width: "100%" }}
              value={password}
              disabled={fieldsDisabled}
              onChange={(e) => setPassword(e.target.value)}
            />
          </label>
        </>
      )}

      <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
        {!isConnected ? (
          <button disabled={busy} onClick={() => connect()}>
            {status.state === "connecting" ? "Connecting…" : "Connect"}
          </button>
        ) : (
          <button disabled={busy} onClick={() => disconnect()}>
            {status.state === "disconnecting" ? "Disconnecting…" : "Disconnect"}
          </button>
        )}
      </div>

      {lastError && <p style={{ color: "#c92a2a" }}>{lastError}</p>}

      <CertificateManagerPanel />
    </fieldset>
  );
}
