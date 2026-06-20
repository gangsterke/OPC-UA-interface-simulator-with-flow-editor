export type ConnectionState =
  | "disconnected"
  | "connecting"
  | "connected"
  | "reconnecting"
  | "disconnecting"
  | "error";

export interface ConnectionStatus {
  state: ConnectionState;
  endpointUrl?: string;
  error?: { message: string };
  updatedAt: string;
}
