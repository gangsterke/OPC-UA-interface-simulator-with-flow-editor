import { describe, it, expect } from "vitest";
import { OPCUAServer, OPCUACertificateManager } from "node-opcua";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { OpcUaService } from "../../src/main/opcua/opcua-service";
import { RunEngine } from "../../src/main/execution/run-engine";
import type { ConnectionProfile } from "../../src/shared/models/connection-profile";
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

describe("RunEngine cancel -> restart", () => {
  it("becomes available for a new run immediately after Stop, not stuck on the cancelled one", async () => {
    const serverCertDir = mkdtempSync(join(tmpdir(), "ifsim-server-cert-"));
    const serverCertificateManager = new OPCUACertificateManager({ rootFolder: serverCertDir });
    await serverCertificateManager.initialize();
    const server = new OPCUAServer({ port: 28553, resourcePath: "/UA/CancelRestart", serverCertificateManager });
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

      const longSteps: SequenceStep[] = [{ id: "step-1", kind: "delay", durationMs: 60000, enabled: true }];

      const engine = new RunEngine();
      const firstCompleted = waitForEvent<{ summary: RunSummary }>(engine, "completed", () => true);
      const firstRunId = await engine.startRun(session, longSteps, []);

      expect(engine.isRunning()).toBe(true);
      const cancelled = engine.cancel(firstRunId);
      expect(cancelled).toBe(true);

      const { summary } = await firstCompleted;
      expect(summary.outcome).toBe("cancelled");
      expect(engine.isRunning()).toBe(false);

      // The exact bug being guarded against: starting a brand new run right
      // after Stop must succeed, not throw "A run is already in progress".
      const quickSteps: SequenceStep[] = [{ id: "step-2", kind: "delay", durationMs: 10, enabled: true }];
      const secondCompleted = waitForEvent<{ summary: RunSummary }>(engine, "completed", () => true);
      const secondRunId = await engine.startRun(session, quickSteps, []);
      expect(secondRunId).not.toBe(firstRunId);
      const { summary: secondSummary } = await secondCompleted;
      expect(secondSummary.outcome).toBe("passed");

      await service.disconnect();
    } finally {
      await server.shutdown();
      await certificateManager.dispose();
      await serverCertificateManager.dispose();
    }
  });
});
