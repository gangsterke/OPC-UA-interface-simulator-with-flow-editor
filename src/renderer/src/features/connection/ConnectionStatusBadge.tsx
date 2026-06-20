import { useConnectionStore } from "./connection-store";
import type { ConnectionState } from "@shared/models/connection-status";

const STATE_COLOR: Record<ConnectionState, string> = {
  disconnected: "#888888",
  connecting: "#d9a300",
  connected: "#1a7f37",
  reconnecting: "#d9a300",
  disconnecting: "#888888",
  error: "#c92a2a",
};

export function ConnectionStatusBadge() {
  const status = useConnectionStore((s) => s.status);
  const color = STATE_COLOR[status.state];

  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 14 }}>
      <span
        style={{
          width: 10,
          height: 10,
          borderRadius: "50%",
          background: color,
          display: "inline-block",
        }}
      />
      {status.state}
      {status.error ? ` – ${status.error.message}` : ""}
    </span>
  );
}
