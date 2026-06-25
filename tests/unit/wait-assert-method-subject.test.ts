import { describe, it, expect } from "vitest";
import { OPCUAServer, OPCUACertificateManager, StatusCodes, type Variant as VariantType } from "node-opcua";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { OpcUaService } from "../../src/main/opcua/opcua-service";
import { resolveRootNode, browseChildren } from "../../src/main/opcua/browse-service";
import { readMethodArguments, resolveMethodNodeReferences } from "../../src/main/opcua/method-service";
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

// A Wait/Assert condition's subject can be a method call instead of a tag -
// the method is re-invoked on every poll, exactly like a tag is re-read, so
// "wait until getMachineSpeed() >= 100" works with no tag involved at all.
describe("Wait/Assert with a method-call subject", () => {
  it("re-invokes the method on every poll until its output satisfies the condition", async () => {
    const serverCertDir = mkdtempSync(join(tmpdir(), "ifsim-server-cert-"));
    const serverCertificateManager = new OPCUACertificateManager({ rootFolder: serverCertDir });
    await serverCertificateManager.initialize();
    const server = new OPCUAServer({ port: 28560, resourcePath: "/UA/MethodSubjectTest", serverCertificateManager });
    await server.initialize();

    const addressSpace = server.engine.addressSpace!;
    const namespace = addressSpace.getOwnNamespace();

    const testObject = namespace.addObject({
      organizedBy: addressSpace.rootFolder.objects,
      browseName: "TestObject",
      nodeId: "s=TestObject",
    });

    let callCount = 0;
    const method = namespace.addMethod(testObject, {
      browseName: "GetMachineSpeed",
      nodeId: "s=GetMachineSpeed",
      inputArguments: [],
      outputArguments: [{ name: "value", dataType: "Double" }],
    });
    method.bindMethod((_inputArguments: VariantType[], _context: unknown) => {
      callCount += 1;
      // Ramps up across successive calls, simulating a machine spinning up -
      // crosses the threshold below only after several real method calls.
      return Promise.resolve({
        statusCode: StatusCodes.Good,
        outputArguments: [{ dataType: "Double", value: callCount * 30 }],
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
      const testObjectNode = topLevel.find((n) => n.displayName === "TestObject")!;
      const objectChildren = await browseChildren(session, testObjectNode.nodeId);
      const methodNode = objectChildren.find((n) => n.displayName === "GetMachineSpeed")!;

      const { input, output } = await readMethodArguments(session, methodNode.nodeId);
      const { objectNode, methodNode: methodNodeRef } = await resolveMethodNodeReferences(
        session,
        testObjectNode.nodeId,
        methodNode.nodeId
      );
      const methodDef: MethodDefinition = {
        id: "method-get-speed",
        alias: "GetMachineSpeed",
        objectNode,
        methodNode: methodNodeRef,
        inputArguments: input,
        outputArguments: output,
      };

      const steps: SequenceStep[] = [
        {
          id: "step-1",
          kind: "waitAssert",
          conditionA: {
            subjectSource: "method",
            tagId: null,
            methodSubject: { methodId: methodDef.id, methodOutputIndex: 0, methodInputArguments: [] },
            comparison: "greaterThan",
            expectedSource: "constant",
            expectedValue: { type: "number", value: 100 },
            expectedTagId: null,
            expectedStepOutput: null,
          },
          conditionB: null,
          combinator: "AND",
          timeoutMs: 2000,
          pollIntervalMs: 30,
          onTimeout: "fail",
          enabled: true,
        },
      ];

      const engine = new RunEngine();
      const completed = waitForEvent<{ summary: RunSummary }>(engine, "completed", () => true);
      await engine.startRun(session, steps, [], [methodDef]);
      const { summary } = await completed;

      expect(summary.outcome).toBe("passed");
      expect(summary.stepResults[0].outcome).toBe("pass");
      // 30*1=30, 30*2=60, 30*3=90, 30*4=120 - must take at least 4 real calls
      // to cross 100, proving the method is genuinely re-invoked each poll
      // rather than read once and cached.
      expect(callCount).toBeGreaterThanOrEqual(4);
      expect(summary.stepResults[0].actualValue).toBe(callCount * 30);

      await service.disconnect();
    } finally {
      await server.shutdown();
      await certificateManager.dispose();
      await serverCertificateManager.dispose();
    }
  });
});
