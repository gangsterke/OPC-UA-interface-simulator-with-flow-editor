export type SecurityPolicy =
  | "None"
  | "Basic128Rsa15"
  | "Basic256"
  | "Basic256Sha256"
  | "Aes128_Sha256_RsaOaep"
  | "Aes256_Sha256_RsaPss";

export type SecurityMode = "None" | "Sign" | "SignAndEncrypt";

export type AuthenticationMode =
  | { kind: "anonymous" }
  | { kind: "usernamePassword"; username: string; password: string };

export interface ConnectionProfile {
  id: string;
  name: string;
  endpointUrl: string;
  securityPolicy: SecurityPolicy;
  securityMode: SecurityMode;
  authentication: AuthenticationMode;
}
