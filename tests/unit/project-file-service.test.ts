import { describe, it, expect } from "vitest";
import { mkdtempSync, writeFileSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { writeProjectFile, readProjectFile } from "../../src/main/project/project-file-service";
import type { Project } from "../../src/shared/models/project";

function sampleProject(): Project {
  return {
    metadata: {
      schemaVersion: 1,
      createdAt: "2026-01-01T00:00:00.000Z",
      modifiedAt: "2026-01-02T00:00:00.000Z",
      appVersionAtSave: "0.1.0",
    },
    connectionProfile: {
      id: "default",
      name: "Default connection",
      endpointUrl: "opc.tcp://192.168.2.129:4840",
      securityPolicy: "None",
      securityMode: "None",
      authentication: { kind: "usernamePassword", username: "admin", password: "super-secret" },
    },
    tags: [
      {
        id: "tag-1",
        alias: "Temperature",
        node: { namespaceUri: "urn:example:ns", namespaceIndexHint: 3, identifierType: "string", identifier: "Temperature" },
        dataType: "Double",
      },
    ],
    sequence: [
      { id: "step-1", kind: "write", tagId: "tag-1", value: { type: "number", value: 11.5 }, enabled: true },
      {
        id: "step-2",
        kind: "waitAssert",
        conditionA: {
          tagId: "tag-1",
          comparison: "equals",
          expectedSource: "constant",
          expectedValue: { type: "number", value: 11.5 },
          expectedTagId: null,
        },
        conditionB: null,
        combinator: "AND",
        timeoutMs: null,
        pollIntervalMs: 250,
        onTimeout: "fail",
        enabled: true,
      },
      { id: "step-3", kind: "delay", durationMs: 1000, enabled: true },
    ],
  };
}

describe("project-file-service", () => {
  it("round-trips a project through disk and strips the password on save", async () => {
    const dir = mkdtempSync(join(tmpdir(), "ifsim-project-"));
    const filePath = join(dir, "test.ifsim.json");
    const project = sampleProject();

    await writeProjectFile(project, filePath);

    const onDisk = JSON.parse(readFileSync(filePath, "utf-8"));
    expect(onDisk.connectionProfile.authentication.password).toBe("");
    expect(onDisk.connectionProfile.authentication.username).toBe("admin");

    const loaded = await readProjectFile(filePath);
    expect(loaded.tags).toHaveLength(1);
    expect(loaded.sequence).toHaveLength(3);
    expect(loaded.connectionProfile.endpointUrl).toBe("opc.tcp://192.168.2.129:4840");
    if (loaded.connectionProfile.authentication.kind === "usernamePassword") {
      expect(loaded.connectionProfile.authentication.password).toBe("");
    } else {
      throw new Error("expected usernamePassword auth");
    }
  });

  it("rejects malformed/hand-edited project files with a clear error instead of crashing", async () => {
    const dir = mkdtempSync(join(tmpdir(), "ifsim-project-"));

    const notJsonPath = join(dir, "not-json.ifsim.json");
    writeFileSync(notJsonPath, "{ this is not valid json ", "utf-8");
    await expect(readProjectFile(notJsonPath)).rejects.toThrow(/not valid JSON/);

    const wrongShapePath = join(dir, "wrong-shape.ifsim.json");
    writeFileSync(wrongShapePath, JSON.stringify({ foo: "bar" }), "utf-8");
    await expect(readProjectFile(wrongShapePath)).rejects.toThrow(/failed validation/);

    const corruptStepPath = join(dir, "corrupt-step.ifsim.json");
    const project = sampleProject();
    // @ts-expect-error - deliberately corrupting the discriminant to test validation
    project.sequence[0].kind = "notARealKind";
    writeFileSync(corruptStepPath, JSON.stringify(project), "utf-8");
    await expect(readProjectFile(corruptStepPath)).rejects.toThrow(/failed validation/);
  });
});
