import { describe, it, expect } from "vitest";
import { OPCUAServer, OPCUACertificateManager, StatusCodes, Variant, DataType, VariantArrayType, Argument } from "node-opcua";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { OpcUaService } from "../../src/main/opcua/opcua-service";
import { resolveRootNode, browseChildren, readNodeAttributes } from "../../src/main/opcua/browse-service";
import { RunEngine } from "../../src/main/execution/run-engine";
import type { ConnectionProfile } from "../../src/shared/models/connection-profile";
import type { Tag } from "../../src/shared/models/tag";
import type { SequenceStep } from "../../src/shared/models/sequence-step";
import type { RunSummary } from "../../src/shared/models/run-result";

async function waitForEvent<T>(engine: RunEngine, event: string, predicate: (payload: T) => boolean): Promise<T> {
  return new Promise((resolve) => {
    const handler = (payload: T): void => {
      if (predicate(payload)) {
        engine.off(event, handler);
        resolve(payload);
      }
    };
    engine.on(event, handler);
  });
}

// A tag's value can be an array of structured records (e.g. an "Alarms"
// array-of-structs tag) - not just a structured method output. A fieldPath
// on a "tag"-sourced ValueSource drills into one element/field of that
// array, e.g. ["1", "name"] for "the 2nd array element's name field".
describe("ValueSource fieldPath into a structured/array tag value", () => {
  it("writes one field of an array-of-structs tag to another tag", async () => {
    const serverCertDir = mkdtempSync(join(tmpdir(), "ifsim-server-cert-"));
    const serverCertificateManager = new OPCUACertificateManager({ rootFolder: serverCertDir });
    await serverCertificateManager.initialize();
    const server = new OPCUAServer({ port: 28561, resourcePath: "/UA/TagFieldPathTest", serverCertificateManager });
    await server.initialize();

    const addressSpace = server.engine.addressSpace!;
    const namespace = addressSpace.getOwnNamespace();

    // Argument is a well-known builtin structured ExtensionObject (ns=0;i=296)
    // - used as a stand-in for "some structured record type", same approach
    // verified during the original Method-calling spike.
    const alarms = [
      new Argument({ name: "AlarmA", dataType: "Int32", valueRank: -1 }),
      new Argument({ name: "AlarmB", dataType: "Int32", valueRank: -1 }),
    ];
    namespace.addVariable({
      organizedBy: addressSpace.rootFolder.objects,
      browseName: "Alarms",
      nodeId: "s=Alarms",
      dataType: Argument.dataTypeNodeId,
      valueRank: 1,
      value: {
        get: () => new Variant({ dataType: DataType.ExtensionObject, arrayType: VariantArrayType.Array, value: alarms }),
      },
    });

    let resultTagValue = "";
    namespace.addVariable({
      organizedBy: addressSpace.rootFolder.objects,
      browseName: "ResultTag",
      nodeId: "s=ResultTag",
      dataType: "String",
      value: {
        get: () => new Variant({ dataType: DataType.String, value: resultTagValue }),
        set: (variant: Variant) => {
          resultTagValue = variant.value;
          return StatusCodes.Good;
        },
      },
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
      const alarmsNode = topLevel.find((n) => n.displayName === "Alarms")!;
      const resultTagNode = topLevel.find((n) => n.displayName === "ResultTag")!;
      const alarmsAttrs = await readNodeAttributes(session, alarmsNode.nodeId);
      const resultTagAttrs = await readNodeAttributes(session, resultTagNode.nodeId);

      const alarmsTag: Tag = { id: "tag-alarms", alias: "Alarms", node: alarmsAttrs.node, dataType: alarmsAttrs.dataType };
      const resultTag: Tag = { id: "tag-result", alias: "ResultTag", node: resultTagAttrs.node, dataType: resultTagAttrs.dataType };
      expect(alarmsTag.dataType).toBe("Unknown");

      const steps: SequenceStep[] = [
        {
          id: "step-write-field",
          kind: "write",
          tagId: resultTag.id,
          value: { source: "tag", tagId: alarmsTag.id, fieldPath: ["1", "name"] },
          enabled: true,
        },
      ];

      const engine = new RunEngine();
      const completed = waitForEvent<{ summary: RunSummary }>(engine, "completed", () => true);
      await engine.startRun(session, steps, [alarmsTag, resultTag]);
      const { summary } = await completed;

      expect(summary.outcome).toBe("passed");
      expect(summary.stepResults[0].outcome).toBe("pass");
      expect(resultTagValue).toBe("AlarmB");

      await service.disconnect();
    } finally {
      await server.shutdown();
      await certificateManager.dispose();
      await serverCertificateManager.dispose();
    }
  });
});
