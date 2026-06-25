import { describe, it, expect } from "vitest";
import { OPCUAServer, OPCUACertificateManager, StatusCodes, type Variant as VariantType } from "node-opcua";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { OpcUaService } from "../../src/main/opcua/opcua-service";
import { resolveRootNode, browseChildren } from "../../src/main/opcua/browse-service";
import { readMethodArguments, callMethod, resolveMethodNodeReferences } from "../../src/main/opcua/method-service";
import type { ConnectionProfile } from "../../src/shared/models/connection-profile";

describe("method-service", () => {
  it("reads InputArguments/OutputArguments metadata and calls the method end-to-end", async () => {
    const serverCertDir = mkdtempSync(join(tmpdir(), "ifsim-server-cert-"));
    const serverCertificateManager = new OPCUACertificateManager({ rootFolder: serverCertDir });
    await serverCertificateManager.initialize();
    const server = new OPCUAServer({ port: 28556, resourcePath: "/UA/MethodTest", serverCertificateManager });
    await server.initialize();

    const addressSpace = server.engine.addressSpace!;
    const namespace = addressSpace.getOwnNamespace();
    const testObject = namespace.addObject({
      organizedBy: addressSpace.rootFolder.objects,
      browseName: "TestObject",
      nodeId: "s=TestObject",
    });

    const method = namespace.addMethod(testObject, {
      browseName: "AddNumbers",
      nodeId: "s=AddNumbers",
      inputArguments: [
        { name: "a", dataType: "Double", description: "first operand" },
        { name: "b", dataType: "Double", description: "second operand" },
      ],
      outputArguments: [{ name: "sum", dataType: "Double", description: "result" }],
    });

    method.bindMethod((inputArguments: VariantType[], _context: unknown) => {
      const a = inputArguments[0].value as number;
      const b = inputArguments[1].value as number;
      return Promise.resolve({
        statusCode: StatusCodes.Good,
        outputArguments: [{ dataType: "Double", value: a + b }],
      });
    });

    await server.start();

    const clientCertDir = mkdtempSync(join(tmpdir(), "ifsim-client-cert-"));
    const certificateManager = new OPCUACertificateManager({ rootFolder: clientCertDir });
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
      const objectNode = topLevel.find((n) => n.displayName === "TestObject")!;
      expect(objectNode.nodeClass).toBe("Object");

      const objectChildren = await browseChildren(session, objectNode.nodeId);
      const methodNode = objectChildren.find((n) => n.displayName === "AddNumbers")!;
      expect(methodNode.nodeClass).toBe("Method");

      const { input, output } = await readMethodArguments(session, methodNode.nodeId);
      expect(input).toEqual([
        { name: "a", dataType: "Double", valueRank: -1 },
        { name: "b", dataType: "Double", valueRank: -1 },
      ]);
      expect(output).toEqual([{ name: "sum", dataType: "Double", valueRank: -1 }]);

      const { objectNode: objectRef, methodNode: methodRef } = await resolveMethodNodeReferences(
        session,
        objectNode.nodeId,
        methodNode.nodeId
      );
      expect(objectRef.identifier).toBe("TestObject");
      expect(methodRef.identifier).toBe("AddNumbers");

      const { Variant, DataType } = await import("node-opcua");
      const result = await callMethod(session, objectNode.nodeId, methodNode.nodeId, [
        new Variant({ dataType: DataType.Double, value: 2.5 }),
        new Variant({ dataType: DataType.Double, value: 4 }),
      ]);
      expect(result.isGood).toBe(true);
      expect(result.outputArguments).toHaveLength(1);
      expect(result.outputArguments[0].value).toBeCloseTo(6.5, 5);

      await service.disconnect();
    } finally {
      await server.shutdown();
      await certificateManager.dispose();
      await serverCertificateManager.dispose();
    }
  });
});
