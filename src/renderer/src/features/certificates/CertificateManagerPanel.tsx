import { useEffect, useState } from "react";
import type { CertificateSummary } from "@shared/models/certificate-summary";

export function CertificateManagerPanel() {
  const [open, setOpen] = useState(false);
  const [clientCert, setClientCert] = useState<CertificateSummary | null>(null);
  const [trusted, setTrusted] = useState<CertificateSummary[]>([]);
  const [exportMessage, setExportMessage] = useState<string | null>(null);

  function refresh(): void {
    window.api.pki.getClientCertificateInfo().then(setClientCert);
    window.api.pki.listTrustedServerCertificates().then(setTrusted);
  }

  useEffect(() => {
    if (open) refresh();
  }, [open]);

  async function handleExport(): Promise<void> {
    setExportMessage(null);
    const result = await window.api.pki.exportClientCertificate();
    if (result.canceled) return;
    setExportMessage(result.ok ? `Exported to ${result.filePath}` : "Export failed");
  }

  if (!open) {
    return (
      <button onClick={() => setOpen(true)} style={{ marginTop: 12 }}>
        Certificates…
      </button>
    );
  }

  return (
    <div style={{ marginTop: 12, borderTop: "1px solid #ddd", paddingTop: 12 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <strong>Certificates</strong>
        <button onClick={() => setOpen(false)}>Close</button>
      </div>

      <h4>Client certificate (this app's identity)</h4>
      {clientCert ? (
        <div>
          <div>
            <strong>Subject:</strong> {clientCert.subject}
          </div>
          <div>
            <strong>Thumbprint:</strong> {clientCert.thumbprint}
          </div>
        </div>
      ) : (
        <p>No client certificate yet - generated automatically on first secure connection.</p>
      )}
      <button onClick={handleExport}>Export client certificate…</button>
      {exportMessage && <p>{exportMessage}</p>}
      <p style={{ fontSize: 12, color: "#666" }}>
        Hand this file to whoever administers the PLC so they can add it to its trusted list -
        this app can only manage trust on its own side.
      </p>

      <h4>Trusted server certificates ({trusted.length})</h4>
      <button onClick={refresh}>Refresh</button>
      <ul>
        {trusted.map((cert) => (
          <li key={cert.thumbprint}>
            {cert.subject} ({cert.thumbprint})
          </li>
        ))}
      </ul>
    </div>
  );
}
