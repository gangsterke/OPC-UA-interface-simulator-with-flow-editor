import { describe, it, expect } from "vitest";
import { OPCUAServer, OPCUACertificateManager, Variant, DataType, StatusCodes } from "node-opcua";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { OpcUaService } from "../../src/main/opcua/opcua-service";
import { resolveRootNode, browseChildren, readNodeAttributes } from "../../src/main/opcua/browse-service";
import { readTagValue } from "../../src/main/opcua/tag-service";
import type { ConnectionProfile } from "../../src/shared/models/connection-profile";

describe("tag resolution (NodeId -> portable TagNodeReference, attributes, value preview)", () => {
  it("resolves namespace URI, data type, access level, and a live value preview for a dropped Variable", async () => {
    const serverCertDir = mkdtempSync(join(tmpdir(), "ifsim-server-cert-"));
    const serverCertificateManager = new OPCUACertificateManager({ rootFolder: serverCertDir });
    await serverCertificateManager.initialize();

    const server = new OPCUAServer({ port: 28546, resourcePath: "/UA/TagTest", serverCertificateManager });
    await server.initialize();

    const addressSpace = server.engine.addressSpace!;
    const namespace = addressSpace.getOwnNamespace();
    const expectedNamespaceUri = namespace.namespaceUri;
    let temperature = 21.5;
    namespace.addVariable({
      organizedBy: addressSpace.rootFolder.objects,
      browseName: "Temperature",
      nodeId: "s=Temperature",
      dataType: "Double",
      value: {
        get: () => new Variant({ dataType: DataType.Double, value: temperature }),
        set: (variant: Variant) => {
          temperature = variant.value;
          return StatusCodes.Good;
        },
      },
    });
    // A read-only variable to confirm AccessLevel.currentWrite comes back false.
    namespace.addVariable({
      organizedBy: addressSpace.rootFolder.objects,
      browseName: "ReadOnlyCounter",
      nodeId: "s=ReadOnlyCounter",
      dataType: "Int32",
      accessLevel: "CurrentRead",
      value: { get: () => new Variant({ dataType: DataType.Int32, value: 42 }) },
    });
    await server.start();

    const certDir = mkdtempSync(join(tmpdir(), "ifsim-client-cert-"));
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

      const topLevel = await browseChildren(session, resolveRootNode().nodeId);
      const temperatureNode = topLevel.find((n) => n.displayName === "Temperature")!;
      const readOnlyNode = topLevel.find((n) => n.displayName === "ReadOnlyCounter")!;

      const attrs = await readNodeAttributes(session, temperatureNode.nodeId);
      expect(attrs.dataType).toBe("Double");
      expect(attrs.accessLevel.currentRead).toBe(true);
      expect(attrs.accessLevel.currentWrite).toBe(true);
      expect(attrs.node.namespaceUri).toBe(expectedNamespaceUri);
      expect(attrs.node.identifierType).toBe("string");
      expect(attrs.node.identifier).toBe("Temperature");
      expect(attrs.node.namespaceIndexHint).toBeGreaterThan(0);

      const readOnlyAttrs = await readNodeAttributes(session, readOnlyNode.nodeId);
      expect(readOnlyAttrs.accessLevel.currentRead).toBe(true);
      expect(readOnlyAttrs.accessLevel.currentWrite).toBe(false);

      const preview = await readTagValue(session, attrs.node);
      expect(preview.dataType).toBe("Double");
      expect(preview.value).toBe(21.5);
      expect(preview.statusCode.name).toBe("Good");

      temperature = 99.9;
      const previewAfterChange = await readTagValue(session, attrs.node);
      expect(previewAfterChange.value).toBe(99.9);

      await service.disconnect();
    } finally {
      await server.shutdown();
      await certificateManager.dispose();
      await serverCertificateManager.dispose();
    }
  });
});
