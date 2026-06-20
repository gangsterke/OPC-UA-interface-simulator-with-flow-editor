import { describe, it, expect } from "vitest";
import {
  OPCUAServer,
  OPCUACertificateManager,
  Variant,
  DataType,
  StatusCodes,
  AttributeIds,
} from "node-opcua";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { OpcUaService } from "../../src/main/opcua/opcua-service";
import type { ConnectionProfile } from "../../src/shared/models/connection-profile";

describe("OpcUaService", () => {
  it("connects, reads/writes, reports status transitions, and disconnects cleanly", async () => {
    // Isolated server certificate store: without this, OPCUAServer falls back
    // to a shared global default PKI folder, which multiple test files
    // initializing in parallel contend over and can deadlock on.
    const serverCertDir = mkdtempSync(join(tmpdir(), "ifsim-server-cert-"));
    const serverCertificateManager = new OPCUACertificateManager({ rootFolder: serverCertDir });
    await serverCertificateManager.initialize();

    const server = new OPCUAServer({ port: 28543, resourcePath: "/UA/Test", serverCertificateManager });
    await server.initialize();

    const addressSpace = server.engine.addressSpace!;
    const namespace = addressSpace.getOwnNamespace();
    let counter = 7;
    namespace.addVariable({
      organizedBy: addressSpace.rootFolder.objects,
      browseName: "TestCounter",
      nodeId: "s=TestCounter",
      dataType: "Int32",
      value: {
        get: () => new Variant({ dataType: DataType.Int32, value: counter }),
        set: (variant: Variant) => {
          counter = variant.value;
          return StatusCodes.Good;
        },
      },
    });
    await server.start();

    const certDir = mkdtempSync(join(tmpdir(), "ifsim-test-"));
    const certificateManager = new OPCUACertificateManager({ rootFolder: certDir });
    await certificateManager.initialize();

    const service = new OpcUaService(certificateManager);
    const observedStates: string[] = [];
    service.on("statusChanged", (status) => observedStates.push(status.state));

    try {
      const profile: ConnectionProfile = {
        id: "test",
        name: "Test",
        endpointUrl: server.getEndpointUrl(),
        securityPolicy: "None",
        securityMode: "None",
        authentication: { kind: "anonymous" },
      };

      await service.connect(profile);
      expect(service.getStatus().state).toBe("connected");

      const session = service.getActiveSession();
      expect(session).not.toBeNull();

      const dataValue = await session!.read({
        nodeId: "ns=1;s=TestCounter",
        attributeId: AttributeIds.Value,
      });
      expect(dataValue.value.value).toBe(7);

      const writeResult = await session!.write({
        nodeId: "ns=1;s=TestCounter",
        attributeId: AttributeIds.Value,
        value: { value: { dataType: "Int32", value: 99 } },
      });
      expect(writeResult.toString()).toContain("Good");

      const dataValueAfterWrite = await session!.read({
        nodeId: "ns=1;s=TestCounter",
        attributeId: AttributeIds.Value,
      });
      expect(dataValueAfterWrite.value.value).toBe(99);

      await service.disconnect();
      expect(service.getStatus().state).toBe("disconnected");
      expect(service.getActiveSession()).toBeNull();

      expect(observedStates).toEqual(
        expect.arrayContaining(["connecting", "connected", "disconnecting", "disconnected"])
      );
      expect(observedStates[observedStates.length - 1]).toBe("disconnected");
    } finally {
      await server.shutdown();
      await serverCertificateManager.dispose();
      rmSync(certDir, { recursive: true, force: true });
    }
  });
});
