import { describe, it, expect } from "vitest";
import { OPCUAServer, OPCUACertificateManager, Variant, DataType, StatusCodes } from "node-opcua";
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

describe("numeric datatypes through write + wait-assert", () => {
  it("Int16 write then equals-compare passes, and a mismatched value correctly fails", async () => {
    const serverCertDir = mkdtempSync(join(tmpdir(), "ifsim-server-cert-"));
    const serverCertificateManager = new OPCUACertificateManager({ rootFolder: serverCertDir });
    await serverCertificateManager.initialize();
    const server = new OPCUAServer({ port: 28554, resourcePath: "/UA/Int16Test", serverCertificateManager });
    await server.initialize();

    const addressSpace = server.engine.addressSpace!;
    const namespace = addressSpace.getOwnNamespace();
    let value = 0;
    namespace.addVariable({
      organizedBy: addressSpace.rootFolder.objects,
      browseName: "Int16Tag",
      nodeId: "s=Int16Tag",
      dataType: "Int16",
      value: {
        get: () => new Variant({ dataType: DataType.Int16, value }),
        set: (variant: Variant) => {
          value = variant.value;
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
      const node = topLevel.find((n) => n.displayName === "Int16Tag")!;
      const attrs = await readNodeAttributes(session, node.nodeId);
      expect(attrs.dataType).toBe("Int16");
      const tag: Tag = { id: "tag-1", alias: "Int16Tag", node: attrs.node, dataType: attrs.dataType };

      const passSteps: SequenceStep[] = [
        {
          id: "step-1",
          kind: "write",
          tagId: tag.id,
          value: { source: "constant", value: { type: "number", value: 11 } },
          enabled: true,
        },
        {
          id: "step-2",
          kind: "waitAssert",
          conditionA: {
            subjectSource: "tag",
            tagId: tag.id,
            methodSubject: { methodId: null, methodOutputIndex: 0, methodInputArguments: [] },
            comparison: "equals",
            expectedSource: "constant",
            expectedValue: { type: "number", value: 11 },
            expectedTagId: null,
            expectedStepOutput: null,
          },
          conditionB: null,
          combinator: "AND",
          timeoutMs: 1000,
          pollIntervalMs: 50,
          onTimeout: "fail",
          enabled: true,
        },
      ];
      const engine1 = new RunEngine();
      const completed1 = waitForEvent<{ summary: RunSummary }>(engine1, "completed", () => true);
      await engine1.startRun(session, passSteps, [tag]);
      const { summary: summary1 } = await completed1;
      expect(summary1.outcome).toBe("passed");
      expect(value).toBe(11);

      const failSteps: SequenceStep[] = [
        {
          id: "step-1",
          kind: "waitAssert",
          conditionA: {
            subjectSource: "tag",
            tagId: tag.id,
            methodSubject: { methodId: null, methodOutputIndex: 0, methodInputArguments: [] },
            comparison: "equals",
            expectedSource: "constant",
            expectedValue: { type: "number", value: 999 },
            expectedTagId: null,
            expectedStepOutput: null,
          },
          conditionB: null,
          combinator: "AND",
          timeoutMs: 200,
          pollIntervalMs: 50,
          onTimeout: "fail",
          enabled: true,
        },
      ];
      const engine2 = new RunEngine();
      const completed2 = waitForEvent<{ summary: RunSummary }>(engine2, "completed", () => true);
      await engine2.startRun(session, failSteps, [tag]);
      const { summary: summary2 } = await completed2;
      expect(summary2.outcome).toBe("failed");

      await service.disconnect();
    } finally {
      await server.shutdown();
      await certificateManager.dispose();
      await serverCertificateManager.dispose();
    }
  });

  it("Float (\"Real\" in Siemens terms) write then equals/tolerance-compare passes, and a mismatched value correctly fails", async () => {
    const serverCertDir = mkdtempSync(join(tmpdir(), "ifsim-server-cert-"));
    const serverCertificateManager = new OPCUACertificateManager({ rootFolder: serverCertDir });
    await serverCertificateManager.initialize();
    const server = new OPCUAServer({ port: 28555, resourcePath: "/UA/RealTest", serverCertificateManager });
    await server.initialize();

    const addressSpace = server.engine.addressSpace!;
    const namespace = addressSpace.getOwnNamespace();
    let value = 0;
    namespace.addVariable({
      organizedBy: addressSpace.rootFolder.objects,
      browseName: "RealTag",
      nodeId: "s=RealTag",
      dataType: "Float",
      value: {
        get: () => new Variant({ dataType: DataType.Float, value }),
        set: (variant: Variant) => {
          value = variant.value;
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
      const node = topLevel.find((n) => n.displayName === "RealTag")!;
      const attrs = await readNodeAttributes(session, node.nodeId);
      expect(attrs.dataType).toBe("Float");
      const tag: Tag = { id: "tag-1", alias: "RealTag", node: attrs.node, dataType: attrs.dataType };

      const passSteps: SequenceStep[] = [
        {
          id: "step-1",
          kind: "write",
          tagId: tag.id,
          value: { source: "constant", value: { type: "number", value: 11.5 } },
          enabled: true,
        },
        {
          id: "step-2",
          kind: "waitAssert",
          conditionA: {
            subjectSource: "tag",
            tagId: tag.id,
            methodSubject: { methodId: null, methodOutputIndex: 0, methodInputArguments: [] },
            comparison: "tolerance",
            expectedSource: "constant",
            expectedValue: { type: "number", value: 11.5 },
            expectedTagId: null,
            expectedStepOutput: null,
            tolerance: 0.01,
            toleranceMode: "absolute",
          },
          conditionB: null,
          combinator: "AND",
          timeoutMs: 1000,
          pollIntervalMs: 50,
          onTimeout: "fail",
          enabled: true,
        },
      ];
      const engine1 = new RunEngine();
      const completed1 = waitForEvent<{ summary: RunSummary }>(engine1, "completed", () => true);
      await engine1.startRun(session, passSteps, [tag]);
      const { summary: summary1 } = await completed1;
      expect(summary1.outcome).toBe("passed");
      expect(value).toBeCloseTo(11.5, 5);

      const failSteps: SequenceStep[] = [
        {
          id: "step-1",
          kind: "waitAssert",
          conditionA: {
            subjectSource: "tag",
            tagId: tag.id,
            methodSubject: { methodId: null, methodOutputIndex: 0, methodInputArguments: [] },
            comparison: "equals",
            expectedSource: "constant",
            expectedValue: { type: "number", value: 999 },
            expectedTagId: null,
            expectedStepOutput: null,
          },
          conditionB: null,
          combinator: "AND",
          timeoutMs: 200,
          pollIntervalMs: 50,
          onTimeout: "fail",
          enabled: true,
        },
      ];
      const engine2 = new RunEngine();
      const completed2 = waitForEvent<{ summary: RunSummary }>(engine2, "completed", () => true);
      await engine2.startRun(session, failSteps, [tag]);
      const { summary: summary2 } = await completed2;
      expect(summary2.outcome).toBe("failed");

      await service.disconnect();
    } finally {
      await server.shutdown();
      await certificateManager.dispose();
      await serverCertificateManager.dispose();
    }
  });
});
