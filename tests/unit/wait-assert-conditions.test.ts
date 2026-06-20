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
import type { SequenceStep, WaitAssertStep } from "../../src/shared/models/sequence-step";
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

describe("WaitAssert multi-condition (AND/OR, tag-vs-tag)", () => {
  it("AND requires both conditions true; OR is satisfied by either one", async () => {
    const serverCertDir = mkdtempSync(join(tmpdir(), "ifsim-server-cert-"));
    const serverCertificateManager = new OPCUACertificateManager({ rootFolder: serverCertDir });
    await serverCertificateManager.initialize();
    const server = new OPCUAServer({ port: 28551, resourcePath: "/UA/RunTestAndOr", serverCertificateManager });
    await server.initialize();

    const addressSpace = server.engine.addressSpace!;
    const namespace = addressSpace.getOwnNamespace();
    namespace.addVariable({
      organizedBy: addressSpace.rootFolder.objects,
      browseName: "FlagA",
      nodeId: "s=FlagA",
      dataType: "Boolean",
      value: { get: () => new Variant({ dataType: DataType.Boolean, value: true }) },
    });
    namespace.addVariable({
      organizedBy: addressSpace.rootFolder.objects,
      browseName: "FlagB",
      nodeId: "s=FlagB",
      dataType: "Boolean",
      value: { get: () => new Variant({ dataType: DataType.Boolean, value: false }) }, // stays false
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
      const flagANode = topLevel.find((n) => n.displayName === "FlagA")!;
      const flagBNode = topLevel.find((n) => n.displayName === "FlagB")!;
      const attrsA = await readNodeAttributes(session, flagANode.nodeId);
      const attrsB = await readNodeAttributes(session, flagBNode.nodeId);
      const tagA: Tag = { id: "tag-a", alias: "FlagA", node: attrsA.node, dataType: attrsA.dataType };
      const tagB: Tag = { id: "tag-b", alias: "FlagB", node: attrsB.node, dataType: attrsB.dataType };

      const baseStep: WaitAssertStep = {
        id: "step-1",
        kind: "waitAssert",
        conditionA: {
          tagId: tagA.id,
          comparison: "equals",
          expectedSource: "constant",
          expectedValue: { type: "boolean", value: true },
          expectedTagId: null,
        },
        conditionB: {
          tagId: tagB.id,
          comparison: "equals",
          expectedSource: "constant",
          expectedValue: { type: "boolean", value: true },
          expectedTagId: null,
        },
        combinator: "AND",
        timeoutMs: 200,
        pollIntervalMs: 50,
        onTimeout: "fail",
        enabled: true,
      };

      // AND: FlagA is true but FlagB stays false - should time out and fail.
      const andSteps: SequenceStep[] = [{ ...baseStep, combinator: "AND" }];
      const engineAnd = new RunEngine();
      const andCompleted = waitForEvent<{ summary: RunSummary }>(engineAnd, "completed", () => true);
      await engineAnd.startRun(session, andSteps, [tagA, tagB]);
      const { summary: andSummary } = await andCompleted;
      expect(andSummary.outcome).toBe("failed");
      expect(andSummary.stepResults[0].outcome).toBe("fail");

      // OR: FlagA is true (FlagB still false) - either being true is enough, should pass.
      const orSteps: SequenceStep[] = [{ ...baseStep, combinator: "OR" }];
      const engineOr = new RunEngine();
      const orCompleted = waitForEvent<{ summary: RunSummary }>(engineOr, "completed", () => true);
      await engineOr.startRun(session, orSteps, [tagA, tagB]);
      const { summary: orSummary } = await orCompleted;
      expect(orSummary.outcome).toBe("passed");
      expect(orSummary.stepResults[0].outcome).toBe("pass");

      await service.disconnect();
    } finally {
      await server.shutdown();
      await certificateManager.dispose();
      await serverCertificateManager.dispose();
    }
  });

  it("compares a tag against another tag's live value instead of a constant", async () => {
    const serverCertDir = mkdtempSync(join(tmpdir(), "ifsim-server-cert-"));
    const serverCertificateManager = new OPCUACertificateManager({ rootFolder: serverCertDir });
    await serverCertificateManager.initialize();
    const server = new OPCUAServer({ port: 28552, resourcePath: "/UA/RunTestTagVsTag", serverCertificateManager });
    await server.initialize();

    const addressSpace = server.engine.addressSpace!;
    const namespace = addressSpace.getOwnNamespace();
    let setpoint = 50;
    let actual = 10;
    namespace.addVariable({
      organizedBy: addressSpace.rootFolder.objects,
      browseName: "Setpoint",
      nodeId: "s=Setpoint",
      dataType: "Double",
      value: { get: () => new Variant({ dataType: DataType.Double, value: setpoint }) },
    });
    namespace.addVariable({
      organizedBy: addressSpace.rootFolder.objects,
      browseName: "Actual",
      nodeId: "s=Actual",
      dataType: "Double",
      value: {
        get: () => new Variant({ dataType: DataType.Double, value: actual }),
        set: (variant: Variant) => {
          actual = variant.value;
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
      const setpointNode = topLevel.find((n) => n.displayName === "Setpoint")!;
      const actualNode = topLevel.find((n) => n.displayName === "Actual")!;
      const setpointAttrs = await readNodeAttributes(session, setpointNode.nodeId);
      const actualAttrs = await readNodeAttributes(session, actualNode.nodeId);
      const setpointTag: Tag = { id: "tag-setpoint", alias: "Setpoint", node: setpointAttrs.node, dataType: setpointAttrs.dataType };
      const actualTag: Tag = { id: "tag-actual", alias: "Actual", node: actualAttrs.node, dataType: actualAttrs.dataType };

      const steps: SequenceStep[] = [
        {
          id: "step-1",
          kind: "waitAssert",
          conditionA: {
            tagId: actualTag.id,
            comparison: "equals",
            expectedSource: "tag",
            expectedValue: { type: "number", value: 0 },
            expectedTagId: setpointTag.id,
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
      await engine.startRun(session, steps, [setpointTag, actualTag]);

      // Actual starts at 10, Setpoint is 50 - condition is false until Actual catches up.
      await new Promise((resolve) => setTimeout(resolve, 150));
      actual = 50;

      const { summary } = await completed;
      expect(summary.outcome).toBe("passed");
      expect(summary.stepResults[0].outcome).toBe("pass");

      await service.disconnect();
    } finally {
      await server.shutdown();
      await certificateManager.dispose();
      await serverCertificateManager.dispose();
    }
  });
});
