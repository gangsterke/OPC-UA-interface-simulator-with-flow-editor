import { describe, it, expect } from "vitest";
import { OPCUAServer, OPCUACertificateManager, StatusCodes, Variant, DataType, Argument, type Variant as VariantType } from "node-opcua";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { OpcUaService } from "../../src/main/opcua/opcua-service";
import { resolveRootNode, browseChildren } from "../../src/main/opcua/browse-service";
import { readMethodArguments, resolveMethodNodeReferences } from "../../src/main/opcua/method-service";
import { resolveTagNodeReference } from "../../src/main/opcua/node-id-utils";
import { RunEngine } from "../../src/main/execution/run-engine";
import type { ConnectionProfile } from "../../src/shared/models/connection-profile";
import type { MethodDefinition } from "../../src/shared/models/method";
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

// A structured (ExtensionObject) method output can't be edited as a constant
// (v1 scope), but its individual fields should still be usable elsewhere via
// a fieldPath - this drills into one field to write it to a tag, and
// separately to use it as a Wait/Assert comparison value.
describe("ValueSource fieldPath into a structured method output", () => {
  it("writes a structured output's field to a tag and compares against it", async () => {
    const serverCertDir = mkdtempSync(join(tmpdir(), "ifsim-server-cert-"));
    const serverCertificateManager = new OPCUACertificateManager({ rootFolder: serverCertDir });
    await serverCertificateManager.initialize();
    const server = new OPCUAServer({ port: 28559, resourcePath: "/UA/FieldPathTest", serverCertificateManager });
    await server.initialize();

    const addressSpace = server.engine.addressSpace!;
    const namespace = addressSpace.getOwnNamespace();

    const testObject = namespace.addObject({
      organizedBy: addressSpace.rootFolder.objects,
      browseName: "TestObject",
      nodeId: "s=TestObject",
    });

    // Argument is a well-known builtin structured ExtensionObject (ns=0;i=296)
    // - used as a stand-in for "some structured output type" without needing
    // to register a custom DataType, same approach verified during the
    // original Method-calling spike.
    const method = namespace.addMethod(testObject, {
      browseName: "GetContent",
      nodeId: "s=GetContent",
      inputArguments: [],
      outputArguments: [{ name: "Content", dataType: Argument.dataTypeNodeId }],
    });
    method.bindMethod((_inputArguments: VariantType[], _context: unknown) => {
      const content = new Argument({ name: "SequenceField", dataType: "Int32", valueRank: -1 });
      return Promise.resolve({
        statusCode: StatusCodes.Good,
        outputArguments: [{ dataType: DataType.ExtensionObject, value: content }],
      });
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
      const testObjectNode = topLevel.find((n) => n.displayName === "TestObject")!;
      const resultTagNode = topLevel.find((n) => n.displayName === "ResultTag")!;
      const objectChildren = await browseChildren(session, testObjectNode.nodeId);
      const getContentNode = objectChildren.find((n) => n.displayName === "GetContent")!;

      const { input, output } = await readMethodArguments(session, getContentNode.nodeId);
      const { objectNode, methodNode } = await resolveMethodNodeReferences(
        session,
        testObjectNode.nodeId,
        getContentNode.nodeId
      );
      const methodDef: MethodDefinition = {
        id: "method-get-content",
        alias: "GetContent",
        objectNode,
        methodNode,
        inputArguments: input,
        outputArguments: output,
      };

      const resultTagRef = await resolveTagNodeReference(session, resultTagNode.nodeId);
      const resultTag = { id: "tag-result", alias: "ResultTag", node: resultTagRef, dataType: "String" as const };

      const steps: SequenceStep[] = [
        { id: "step-get-content", kind: "callMethod", methodId: methodDef.id, inputArguments: [], enabled: true },
        {
          id: "step-write-field",
          kind: "write",
          tagId: resultTag.id,
          value: { source: "stepOutput", stepId: "step-get-content", outputIndex: 0, fieldPath: ["name"] },
          enabled: true,
        },
        {
          id: "step-compare-field",
          kind: "waitAssert",
          conditionA: {
            subjectSource: "tag",
            tagId: resultTag.id,
            methodSubject: { methodId: null, methodOutputIndex: 0, methodInputArguments: [] },
            comparison: "equals",
            expectedSource: "stepOutput",
            expectedValue: { type: "string", value: "" },
            expectedTagId: null,
            expectedStepOutput: { stepId: "step-get-content", outputIndex: 0, fieldPath: ["name"] },
          },
          conditionB: null,
          combinator: "AND",
          timeoutMs: 1000,
          pollIntervalMs: 50,
          onTimeout: "fail",
          enabled: true,
        },
      ];

      const engine = new RunEngine();
      const completed = waitForEvent<{ summary: RunSummary }>(engine, "completed", () => true);
      await engine.startRun(session, steps, [resultTag], [methodDef]);
      const { summary } = await completed;

      expect(summary.outcome).toBe("passed");
      expect(summary.stepResults.map((r) => r.outcome)).toEqual(["pass", "pass", "pass"]);
      expect(resultTagValue).toBe("SequenceField");
      expect(summary.stepResults[1].actualValue).toBe("SequenceField");

      await service.disconnect();
    } finally {
      await server.shutdown();
      await certificateManager.dispose();
      await serverCertificateManager.dispose();
    }
  });
});
