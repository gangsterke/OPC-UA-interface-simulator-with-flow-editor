import { useEffect, useState } from "react";
import { useConnectionStore } from "../connection/connection-store";
import type { CertificateSummary } from "@shared/models/certificate-summary";

export function CertificateTrustDialog() {
  const certificateRejected = useConnectionStore((s) => s.certificateRejected);
  const dismiss = useConnectionStore((s) => s.dismissCertificateRejected);
  const connect = useConnectionStore((s) => s.connect);

  const [rejected, setRejected] = useState<CertificateSummary[]>([]);
  const [trusting, setTrusting] = useState<string | null>(null);

  useEffect(() => {
    if (!certificateRejected) return;
    window.api.pki.listRejectedServerCertificates().then(setRejected);
  }, [certificateRejected]);

  if (!certificateRejected) return null;

  async function handleTrustAndRetry(thumbprint: string): Promise<void> {
    setTrusting(thumbprint);
    try {
      await window.api.pki.trustRejectedCertificate(thumbprint);
      dismiss();
      await connect();
    } finally {
      setTrusting(null);
    }
  }

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.4)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 1000,
      }}
    >
      <div style={{ background: "white", borderRadius: 8, padding: 24, maxWidth: 560 }}>
        <h2>Untrusted server certificate</h2>
        <p>
          The OPC UA server presented a certificate this app does not yet trust. Review it below
          and trust it to retry the connection, or cancel if this is unexpected.
        </p>

        {rejected.length === 0 && <p>Loading…</p>}

        {rejected.map((cert) => (
          <div
            key={cert.thumbprint}
            style={{ border: "1px solid #ddd", borderRadius: 6, padding: 12, marginBottom: 12 }}
          >
            <div>
              <strong>Subject:</strong> {cert.subject}
            </div>
            <div>
              <strong>Thumbprint:</strong> {cert.thumbprint}
            </div>
            <div>
              <strong>Validity:</strong> {new Date(cert.notBefore).toLocaleDateString()} –{" "}
              {new Date(cert.notAfter).toLocaleDateString()}
            </div>
            <button
              style={{ marginTop: 8 }}
              disabled={trusting === cert.thumbprint}
              onClick={() => handleTrustAndRetry(cert.thumbprint)}
            >
              {trusting === cert.thumbprint ? "Trusting…" : "Trust and Retry"}
            </button>
          </div>
        ))}

        <button onClick={dismiss}>Cancel</button>
      </div>
    </div>
  );
}
