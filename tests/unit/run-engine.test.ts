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
import type { StepResult, RunSummary } from "../../src/shared/models/run-result";

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

describe("RunEngine", () => {
  it("runs a write, a passing wait-assert, and a delay end-to-end (pass case)", async () => {
    const serverCertDir = mkdtempSync(join(tmpdir(), "ifsim-server-cert-"));
    const serverCertificateManager = new OPCUACertificateManager({ rootFolder: serverCertDir });
    await serverCertificateManager.initialize();
    const server = new OPCUAServer({ port: 28547, resourcePath: "/UA/RunTest", serverCertificateManager });
    await server.initialize();

    const addressSpace = server.engine.addressSpace!;
    const namespace = addressSpace.getOwnNamespace();
    let counter = 0;
    namespace.addVariable({
      organizedBy: addressSpace.rootFolder.objects,
      browseName: "Counter",
      nodeId: "s=Counter",
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
      const counterNode = topLevel.find((n) => n.displayName === "Counter")!;
      const attrs = await readNodeAttributes(session, counterNode.nodeId);

      const tag: Tag = { id: "tag-1", alias: "Counter", node: attrs.node, dataType: attrs.dataType };

      const steps: SequenceStep[] = [
        { id: "step-1", kind: "write", tagId: tag.id, value: { type: "number", value: 7 }, enabled: true },
        {
          id: "step-2",
          kind: "waitAssert",
          conditionA: {
            tagId: tag.id,
            comparison: "equals",
            expectedSource: "constant",
            expectedValue: { type: "number", value: 7 },
            expectedTagId: null,
          },
          conditionB: null,
          combinator: "AND",
          timeoutMs: 2000,
          pollIntervalMs: 100,
          onTimeout: "fail",
          enabled: true,
        },
        { id: "step-3", kind: "delay", durationMs: 100, enabled: true },
      ];

      const engine = new RunEngine();
      const completedPromise = waitForEvent<{ runId: string; summary: RunSummary }>(engine, "completed", () => true);
      const runId = await engine.startRun(session, steps, [tag]);
      const { summary } = await completedPromise;

      expect(summary.runId).toBe(runId);
      expect(summary.outcome).toBe("passed");
      expect(summary.stepResults).toHaveLength(3);
      expect(summary.stepResults.map((r) => r.outcome)).toEqual(["pass", "pass", "pass"]);
      expect(counter).toBe(7);

      await service.disconnect();
    } finally {
      await server.shutdown();
      await certificateManager.dispose();
      await serverCertificateManager.dispose();
    }
  });

  it("fails a wait-assert on timeout and skips the remaining step (fail case)", async () => {
    const serverCertDir = mkdtempSync(join(tmpdir(), "ifsim-server-cert-"));
    const serverCertificateManager = new OPCUACertificateManager({ rootFolder: serverCertDir });
    await serverCertificateManager.initialize();
    const server = new OPCUAServer({ port: 28548, resourcePath: "/UA/RunTestFail", serverCertificateManager });
    await server.initialize();

    const addressSpace = server.engine.addressSpace!;
    const namespace = addressSpace.getOwnNamespace();
    namespace.addVariable({
      organizedBy: addressSpace.rootFolder.objects,
      browseName: "Stuck",
      nodeId: "s=Stuck",
      dataType: "Int32",
      value: { get: () => new Variant({ dataType: DataType.Int32, value: 0 }) },
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
      const stuckNode = topLevel.find((n) => n.displayName === "Stuck")!;
      const attrs = await readNodeAttributes(session, stuckNode.nodeId);
      const tag: Tag = { id: "tag-1", alias: "Stuck", node: attrs.node, dataType: attrs.dataType };

      const steps: SequenceStep[] = [
        {
          id: "step-1",
          kind: "waitAssert",
          conditionA: {
            tagId: tag.id,
            comparison: "equals",
            expectedSource: "constant",
            expectedValue: { type: "number", value: 999 }, // never true - deliberately too short timeout
            expectedTagId: null,
          },
          conditionB: null,
          combinator: "AND",
          timeoutMs: 200,
          pollIntervalMs: 50,
          onTimeout: "fail",
          enabled: true,
        },
        { id: "step-2", kind: "delay", durationMs: 100, enabled: true },
      ];

      const engine = new RunEngine();
      const completedPromise = waitForEvent<{ runId: string; summary: RunSummary }>(engine, "completed", () => true);
      await engine.startRun(session, steps, [tag]);
      const { summary } = await completedPromise;

      expect(summary.outcome).toBe("failed");
      expect(summary.stepResults[0].outcome).toBe("fail");
      expect(summary.stepResults[1].outcome).toBe("skipped");

      await service.disconnect();
    } finally {
      await server.shutdown();
      await certificateManager.dispose();
      await serverCertificateManager.dispose();
    }
  });

  it("waits indefinitely (timeoutMs: null) until the condition becomes true, with no deadline", async () => {
    const serverCertDir = mkdtempSync(join(tmpdir(), "ifsim-server-cert-"));
    const serverCertificateManager = new OPCUACertificateManager({ rootFolder: serverCertDir });
    await serverCertificateManager.initialize();
    const server = new OPCUAServer({ port: 28550, resourcePath: "/UA/RunTestNoTimeout", serverCertificateManager });
    await server.initialize();

    const addressSpace = server.engine.addressSpace!;
    const namespace = addressSpace.getOwnNamespace();
    let ready = false;
    namespace.addVariable({
      organizedBy: addressSpace.rootFolder.objects,
      browseName: "Ready",
      nodeId: "s=Ready",
      dataType: "Boolean",
      value: { get: () => new Variant({ dataType: DataType.Boolean, value: ready }) },
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
      const readyNode = topLevel.find((n) => n.displayName === "Ready")!;
      const attrs = await readNodeAttributes(session, readyNode.nodeId);
      const tag: Tag = { id: "tag-1", alias: "Ready", node: attrs.node, dataType: attrs.dataType };

      const steps: SequenceStep[] = [
        {
          id: "step-1",
          kind: "waitAssert",
          conditionA: {
            tagId: tag.id,
            comparison: "equals",
            expectedSource: "constant",
            expectedValue: { type: "boolean", value: true },
            expectedTagId: null,
          },
          conditionB: null,
          combinator: "AND",
          timeoutMs: null,
          pollIntervalMs: 50,
          onTimeout: "fail",
          enabled: true,
        },
      ];

      const engine = new RunEngine();
      const completedPromise = waitForEvent<{ runId: string; summary: RunSummary }>(engine, "completed", () => true);
      await engine.startRun(session, steps, [tag]);

      // Flip the value true only after waiting past what would have been a
      // typical short timeout, proving the step had no deadline of its own.
      await new Promise((resolve) => setTimeout(resolve, 300));
      ready = true;

      const { summary } = await completedPromise;
      expect(summary.outcome).toBe("passed");
      expect(summary.stepResults[0].outcome).toBe("pass");

      await service.disconnect();
    } finally {
      await server.shutdown();
      await certificateManager.dispose();
      await serverCertificateManager.dispose();
    }
  });

  it("cancels a run mid-flight and marks remaining steps cancelled/skipped", async () => {
    const serverCertDir = mkdtempSync(join(tmpdir(), "ifsim-server-cert-"));
    const serverCertificateManager = new OPCUACertificateManager({ rootFolder: serverCertDir });
    await serverCertificateManager.initialize();
    const server = new OPCUAServer({ port: 28549, resourcePath: "/UA/RunTestCancel", serverCertificateManager });
    await server.initialize();
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

      const steps: SequenceStep[] = [
        { id: "step-1", kind: "delay", durationMs: 5000, enabled: true },
        { id: "step-2", kind: "delay", durationMs: 100, enabled: true },
      ];

      const engine = new RunEngine();
      const completedPromise = waitForEvent<{ runId: string; summary: RunSummary }>(engine, "completed", () => true);
      const runId = await engine.startRun(session, steps, []);

      const firstProgress = await waitForEvent<{ stepIndex: number }>(engine, "stepProgress", (p) => p.stepIndex === 0);
      expect(firstProgress.stepIndex).toBe(0);

      const cancelled = engine.cancel(runId);
      expect(cancelled).toBe(true);

      const { summary } = await completedPromise;
      expect(summary.outcome).toBe("cancelled");
      expect(summary.stepResults[0].outcome).toBe("cancelled");
      expect(summary.stepResults[1].outcome).toBe("cancelled");

      await service.disconnect();
    } finally {
      await server.shutdown();
      await certificateManager.dispose();
      await serverCertificateManager.dispose();
    }
  });
});
