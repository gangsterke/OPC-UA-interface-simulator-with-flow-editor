import { describe, it, expect } from "vitest";
import { OPCUAServer, OPCUACertificateManager } from "node-opcua";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { OpcUaService } from "../../src/main/opcua/opcua-service";
import {
  createClientCertificateManager,
  getClientCertificateInfo,
  listRejectedServerCertificates,
  listTrustedServerCertificates,
  trustRejectedCertificateByThumbprint,
} from "../../src/main/opcua/certificate-service";
import type { ConnectionProfile } from "../../src/shared/models/connection-profile";

describe("certificate trust flow", () => {
  it("rejects an untrusted server cert, then trusts it and reconnects successfully", async () => {
    const serverCertDir = mkdtempSync(join(tmpdir(), "ifsim-server-cert-"));
    // This test exercises our app's (client-side) reject -> trust -> retry flow only.
    // The server trusting our client cert is the other, server-administered half of
    // OPC UA's two-way trust dance (in production, the PLC admin does this via TIA
    // Portal) - out of scope for our app by design, so auto-accept it here so the
    // throwaway test server doesn't block the client-side behavior under test.
    const serverCertificateManager = new OPCUACertificateManager({
      rootFolder: serverCertDir,
      automaticallyAcceptUnknownCertificate: true,
    });
    await serverCertificateManager.initialize();

    const server = new OPCUAServer({ port: 28544, resourcePath: "/UA/CertTest", serverCertificateManager });
    await server.initialize();
    await server.start();

    const certDir = mkdtempSync(join(tmpdir(), "ifsim-cert-test-"));
    const certificateManager = await createClientCertificateManager(certDir);

    // The client's own certificate is generated lazily on first secure connect
    // attempt, not at certificateManager.initialize() time - verified empirically.
    expect(getClientCertificateInfo(certificateManager)).toBeNull();

    const service = new OpcUaService(certificateManager);

    try {
      const profile: ConnectionProfile = {
        id: "test",
        name: "Test",
        endpointUrl: server.getEndpointUrl(),
        securityPolicy: "Basic256Sha256",
        securityMode: "SignAndEncrypt",
        authentication: { kind: "anonymous" },
      };

      await expect(service.connect(profile)).rejects.toThrow(/BadCertificateUntrusted/);
      expect(service.getStatus().state).toBe("error");

      const clientInfo = getClientCertificateInfo(certificateManager);
      expect(clientInfo).not.toBeNull();
      expect(clientInfo!.thumbprint).toMatch(/^[0-9a-f]{40}$/);

      const rejected = listRejectedServerCertificates(certificateManager);
      expect(rejected).toHaveLength(1);
      expect(rejected[0].subject).toContain("CN=");

      const trustedBefore = listTrustedServerCertificates(certificateManager);
      expect(trustedBefore).toHaveLength(0);

      const trustResult = await trustRejectedCertificateByThumbprint(certificateManager, rejected[0].thumbprint);
      expect(trustResult).toBe(true);

      const trustedAfter = listTrustedServerCertificates(certificateManager);
      expect(trustedAfter).toHaveLength(1);
      expect(trustedAfter[0].thumbprint).toBe(rejected[0].thumbprint);

      // Retry now that the server's certificate is trusted - should succeed.
      await service.connect(profile);
      expect(service.getStatus().state).toBe("connected");

      await service.disconnect();
      expect(service.getStatus().state).toBe("disconnected");
    } finally {
      await server.shutdown();
      await certificateManager.dispose();
      await serverCertificateManager.dispose();
      // certDir is left under the OS temp directory rather than rmSync'd here:
      // dispose() closes the manager's own watchers, but a third-party mutex
      // lib it depends on tears down its file watch asynchronously, racing a
      // synchronous rmSync and firing a benign but unhandled EPERM "watch"
      // error afterwards. The OS temp dir is ephemeral, so leaving it is fine.
    }
  });
});
