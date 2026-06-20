import { describe, it, expect } from "vitest";
import { OPCUAServer, OPCUACertificateManager, Variant, DataType } from "node-opcua";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { OpcUaService } from "../../src/main/opcua/opcua-service";
import { resolveRootNode, browseChildren } from "../../src/main/opcua/browse-service";
import type { ConnectionProfile } from "../../src/shared/models/connection-profile";

describe("browse-service", () => {
  it("resolves the Objects root and lazily browses one level of children at a time", async () => {
    const serverCertDir = mkdtempSync(join(tmpdir(), "ifsim-server-cert-"));
    const serverCertificateManager = new OPCUACertificateManager({ rootFolder: serverCertDir });
    await serverCertificateManager.initialize();

    const server = new OPCUAServer({ port: 28545, resourcePath: "/UA/BrowseTest", serverCertificateManager });
    await server.initialize();

    const addressSpace = server.engine.addressSpace!;
    const namespace = addressSpace.getOwnNamespace();
    const folder = namespace.addFolder(addressSpace.rootFolder.objects, { browseName: "Plant" });
    namespace.addVariable({
      componentOf: folder,
      browseName: "Temperature",
      nodeId: "s=Temperature",
      dataType: "Double",
      value: { get: () => new Variant({ dataType: DataType.Double, value: 21.5 }) },
    });
    namespace.addVariable({
      componentOf: folder,
      browseName: "Pressure",
      nodeId: "s=Pressure",
      dataType: "Double",
      value: { get: () => new Variant({ dataType: DataType.Double, value: 1.013 }) },
    });
    await server.start();

    const certDir = mkdtempSync(join(tmpdir(), "ifsim-browse-test-"));
    const certificateManager = new OPCUACertificateManager({ rootFolder: certDir });
    await certificateManager.initialize();
    const service = new OpcUaService(certificateManager);

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
      const session = service.getActiveSession()!;

      const root = resolveRootNode();
      expect(root.displayName).toBe("Objects");
      expect(root.hasChildrenHint).toBe(true);

      const topLevel = await browseChildren(session, root.nodeId);
      const plantNode = topLevel.find((n) => n.displayName === "Plant");
      expect(plantNode).toBeDefined();
      expect(plantNode!.nodeClass).toBe("Object");
      expect(plantNode!.hasChildrenHint).toBe(true);

      const plantChildren = await browseChildren(session, plantNode!.nodeId);
      const names = plantChildren.map((n) => n.displayName).sort();
      expect(names).toEqual(["Pressure", "Temperature"]);

      const temperatureNode = plantChildren.find((n) => n.displayName === "Temperature")!;
      expect(temperatureNode.nodeClass).toBe("Variable");
      expect(temperatureNode.hasChildrenHint).toBe(false);

      await service.disconnect();
    } finally {
      await server.shutdown();
      await certificateManager.dispose();
      await serverCertificateManager.dispose();
    }
  });
});
