import { join } from "node:path";
import { readdirSync } from "node:fs";
import { writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { OPCUACertificateManager } from "node-opcua";
import { readCertificate, exploreCertificateInfo } from "node-opcua-crypto";
import type { CertificateSummary } from "@shared/models/certificate-summary";

// No Electron dependency here by design (mirrors OpcUaService) - the caller
// resolves the userData-scoped root folder and owns the manager instance;
// this module stays pure filesystem/crypto logic, directly unit-testable.
export async function createClientCertificateManager(rootFolder: string): Promise<OPCUACertificateManager> {
  const certificateManager = new OPCUACertificateManager({
    rootFolder,
    automaticallyAcceptUnknownCertificate: false,
  });
  await certificateManager.initialize();
  return certificateManager;
}

const SUBJECT_KEY_ABBREVIATIONS: Record<string, string> = {
  commonName: "CN",
  organizationName: "O",
  organizationalUnitName: "OU",
  localityName: "L",
  stateOrProvinceName: "ST",
  countryName: "C",
};

function formatSubject(subject: Record<string, string | undefined>): string {
  return Object.entries(subject)
    .filter(([, value]) => value !== undefined)
    .map(([key, value]) => `${SUBJECT_KEY_ABBREVIATIONS[key] ?? key}=${value}`)
    .join(", ");
}

function toIsoString(value: unknown): string {
  return value instanceof Date ? value.toISOString() : String(value);
}

// Certificate "thumbprint" is just the SHA1 hash of the raw DER bytes - this
// matches the value node-opcua itself logs/embeds in rejected-cert filenames
// (verified empirically against a throwaway secure connection during planning).
function summarizeCertificateFile(folder: string, fileName: string): CertificateSummary {
  const certificate = readCertificate(join(folder, fileName));
  const info = exploreCertificateInfo(certificate);
  const thumbprint = createHash("sha1").update(certificate).digest("hex");
  return {
    fileName,
    thumbprint,
    subject: formatSubject(info.subject as Record<string, string | undefined>),
    notBefore: toIsoString(info.notBefore),
    notAfter: toIsoString(info.notAfter),
  };
}

function listCertificateSummaries(folder: string): CertificateSummary[] {
  let fileNames: string[];
  try {
    fileNames = readdirSync(folder).filter((f) => f.endsWith(".pem") || f.endsWith(".der"));
  } catch {
    return [];
  }
  return fileNames.map((fileName) => summarizeCertificateFile(folder, fileName));
}

export function getClientCertificateInfo(manager: OPCUACertificateManager): CertificateSummary | null {
  const summaries = listCertificateSummaries(join(manager.rootDir, "own", "certs"));
  return summaries[0] ?? null;
}

export function listTrustedServerCertificates(manager: OPCUACertificateManager): CertificateSummary[] {
  return listCertificateSummaries(join(manager.rootDir, "trusted", "certs"));
}

// Rejected certificates are written directly under rootDir/rejected (no "certs"
// subfolder) - this is node-opcua's actual on-disk layout, not "trusted"'s.
export function listRejectedServerCertificates(manager: OPCUACertificateManager): CertificateSummary[] {
  return listCertificateSummaries(join(manager.rootDir, "rejected"));
}

export async function trustRejectedCertificateByThumbprint(
  manager: OPCUACertificateManager,
  thumbprint: string
): Promise<boolean> {
  const rejectedDir = join(manager.rootDir, "rejected");
  let fileNames: string[];
  try {
    fileNames = readdirSync(rejectedDir).filter((f) => f.endsWith(".pem") || f.endsWith(".der"));
  } catch {
    return false;
  }
  for (const fileName of fileNames) {
    const certificate = readCertificate(join(rejectedDir, fileName));
    const candidateThumbprint = createHash("sha1").update(certificate).digest("hex");
    if (candidateThumbprint === thumbprint) {
      await manager.trustCertificate(certificate);
      return true;
    }
  }
  return false;
}

export async function exportClientCertificate(manager: OPCUACertificateManager, destPath: string): Promise<void> {
  const ownCertsDir = join(manager.rootDir, "own", "certs");
  const fileNames = readdirSync(ownCertsDir).filter((f) => f.endsWith(".pem"));
  if (fileNames.length === 0) {
    throw new Error("No client certificate found to export");
  }
  const certificate = readCertificate(join(ownCertsDir, fileNames[0]));
  await writeFile(destPath, certificate);
}
