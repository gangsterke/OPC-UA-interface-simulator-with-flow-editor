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
    methods: [
      {
        id: "method-1",
        alias: "GetRequestEnvelope",
        objectNode: { namespaceUri: "urn:example:ns", namespaceIndexHint: 3, identifierType: "string", identifier: "MessageBuffer" },
        methodNode: { namespaceUri: "urn:example:ns", namespaceIndexHint: 3, identifierType: "string", identifier: "GetRequestEnvelope" },
        inputArguments: [],
        outputArguments: [{ name: "requestPayload", dataType: "String", valueRank: -1 }],
      },
    ],
    sequence: [
      {
        id: "step-1",
        kind: "write",
        tagId: "tag-1",
        value: { source: "constant", value: { type: "number", value: 11.5 } },
        enabled: true,
      },
      {
        id: "step-2",
        kind: "waitAssert",
        conditionA: {
          subjectSource: "tag",
          tagId: "tag-1",
          methodSubject: { methodId: null, methodOutputIndex: 0, methodInputArguments: [] },
          comparison: "equals",
          expectedSource: "constant",
          expectedValue: { type: "number", value: 11.5 },
          expectedTagId: null,
          expectedStepOutput: null,
        },
        conditionB: null,
        combinator: "AND",
        timeoutMs: null,
        pollIntervalMs: 250,
        onTimeout: "fail",
        enabled: true,
      },
      { id: "step-3", kind: "delay", durationMs: 1000, enabled: true },
      { id: "step-4", kind: "callMethod", methodId: "method-1", inputArguments: [], enabled: true },
      {
        id: "step-5",
        kind: "callMethod",
        methodId: "method-1",
        inputArguments: [{ source: "stepOutput", stepId: "step-4", outputIndex: 0, fieldPath: [] }],
        enabled: true,
      },
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
    expect(loaded.methods).toHaveLength(1);
    expect(loaded.sequence).toHaveLength(5);
    const lastStep = loaded.sequence[4];
    if (lastStep.kind !== "callMethod") throw new Error("expected a callMethod step");
    expect(lastStep.inputArguments[0]).toEqual({ source: "stepOutput", stepId: "step-4", outputIndex: 0, fieldPath: [] });
    expect(loaded.connectionProfile.endpointUrl).toBe("opc.tcp://192.168.2.129:4840");
    if (loaded.connectionProfile.authentication.kind === "usernamePassword") {
      expect(loaded.connectionProfile.authentication.password).toBe("");
    } else {
      throw new Error("expected usernamePassword auth");
    }
  });

  it("loads a project file saved before the methods field existed, defaulting it to []", async () => {
    const dir = mkdtempSync(join(tmpdir(), "ifsim-project-"));
    const filePath = join(dir, "pre-methods.ifsim.json");
    const project = sampleProject();
    // @ts-expect-error - simulating a file saved before `methods` existed
    delete project.methods;
    writeFileSync(filePath, JSON.stringify(project), "utf-8");

    const loaded = await readProjectFile(filePath);
    expect(loaded.methods).toEqual([]);
    expect(loaded.tags).toHaveLength(1);
  });

  it("loads a WriteStep saved before value became a ValueSource, wrapping the bare literal as a constant", async () => {
    const dir = mkdtempSync(join(tmpdir(), "ifsim-project-"));
    const filePath = join(dir, "pre-value-source.ifsim.json");
    const project = sampleProject();
    const writeStep = project.sequence[0];
    if (writeStep.kind !== "write") throw new Error("expected the first step to be a write step");
    // Simulate a file saved before WriteStep.value was a ValueSource - back
    // then it stored the bare TagLiteralValue directly.
    // @ts-expect-error - deliberately writing the old pre-migration shape
    writeStep.value = { type: "number", value: 11.5 };
    writeFileSync(filePath, JSON.stringify(project), "utf-8");

    const loaded = await readProjectFile(filePath);
    const loadedWriteStep = loaded.sequence[0];
    if (loadedWriteStep.kind !== "write") throw new Error("expected the first step to be a write step");
    expect(loadedWriteStep.value).toEqual({ source: "constant", value: { type: "number", value: 11.5 } });
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
