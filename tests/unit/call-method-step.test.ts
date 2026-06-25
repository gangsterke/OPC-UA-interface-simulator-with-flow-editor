import { describe, it, expect } from "vitest";
import { OPCUAServer, OPCUACertificateManager, StatusCodes, Variant, DataType, type Variant as VariantType } from "node-opcua";
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

describe("CallMethodStep (executor + RunEngine integration)", () => {
  it("calls a method with constant and tag-sourced input arguments and captures outputs", async () => {
    const serverCertDir = mkdtempSync(join(tmpdir(), "ifsim-server-cert-"));
    const serverCertificateManager = new OPCUACertificateManager({ rootFolder: serverCertDir });
    await serverCertificateManager.initialize();
    const server = new OPCUAServer({ port: 28557, resourcePath: "/UA/CallMethodStepTest", serverCertificateManager });
    await server.initialize();

    const addressSpace = server.engine.addressSpace!;
    const namespace = addressSpace.getOwnNamespace();
    let multiplier = 3;
    namespace.addVariable({
      organizedBy: addressSpace.rootFolder.objects,
      browseName: "Multiplier",
      nodeId: "s=Multiplier",
      dataType: "Double",
      value: { get: () => new Variant({ dataType: DataType.Double, value: multiplier }) },
    });

    const testObject = namespace.addObject({
      organizedBy: addressSpace.rootFolder.objects,
      browseName: "Calculator",
      nodeId: "s=Calculator",
    });
    const method = namespace.addMethod(testObject, {
      browseName: "Multiply",
      nodeId: "s=Multiply",
      inputArguments: [
        { name: "value", dataType: "Double" },
        { name: "factor", dataType: "Double" },
      ],
      outputArguments: [{ name: "result", dataType: "Double" }],
    });
    method.bindMethod((inputArguments: VariantType[], _context: unknown) => {
      const value = inputArguments[0].value as number;
      const factor = inputArguments[1].value as number;
      return Promise.resolve({
        statusCode: StatusCodes.Good,
        outputArguments: [{ dataType: "Double", value: value * factor }],
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
      const multiplierNode = topLevel.find((n) => n.displayName === "Multiplier")!;
      const calculatorNode = topLevel.find((n) => n.displayName === "Calculator")!;
      const calculatorChildren = await browseChildren(session, calculatorNode.nodeId);
      const multiplyNode = calculatorChildren.find((n) => n.displayName === "Multiply")!;

      const { input, output } = await readMethodArguments(session, multiplyNode.nodeId);
      const { objectNode, methodNode } = await resolveMethodNodeReferences(
        session,
        calculatorNode.nodeId,
        multiplyNode.nodeId
      );

      const multiplierTagNode = await (async () => {
        const { resolveTagNodeReference } = await import("../../src/main/opcua/node-id-utils");
        return resolveTagNodeReference(session, multiplierNode.nodeId);
      })();

      const methodDef: MethodDefinition = {
        id: "method-1",
        alias: "Multiply",
        objectNode,
        methodNode,
        inputArguments: input,
        outputArguments: output,
      };

      const steps: SequenceStep[] = [
        {
          id: "step-1",
          kind: "callMethod",
          methodId: methodDef.id,
          inputArguments: [
            { source: "constant", value: { type: "number", value: 7 } },
            { source: "tag", tagId: "tag-multiplier", fieldPath: [] },
          ],
          enabled: true,
        },
      ];

      const tags = [
        { id: "tag-multiplier", alias: "Multiplier", node: multiplierTagNode, dataType: "Double" as const },
      ];

      const engine = new RunEngine();
      const completed = waitForEvent<{ summary: RunSummary }>(engine, "completed", () => true);
      await engine.startRun(session, steps, tags, [methodDef]);
      const { summary } = await completed;

      expect(summary.outcome).toBe("passed");
      expect(summary.stepResults[0].outcome).toBe("pass");
      expect(summary.stepResults[0].actualValue).toBe("result=21");

      await service.disconnect();
    } finally {
      await server.shutdown();
      await certificateManager.dispose();
      await serverCertificateManager.dispose();
    }
  });
});
