import { describe, it, expect } from "vitest";
import { OPCUAServer, OPCUACertificateManager, Variant, DataType, StatusCodes, type Variant as VariantType } from "node-opcua";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { OpcUaService } from "../../src/main/opcua/opcua-service";
import { resolveRootNode, browseChildren, readNodeAttributes } from "../../src/main/opcua/browse-service";
import { readMethodArguments, resolveMethodNodeReferences } from "../../src/main/opcua/method-service";
import { RunEngine } from "../../src/main/execution/run-engine";
import type { ConnectionProfile } from "../../src/shared/models/connection-profile";
import type { Tag } from "../../src/shared/models/tag";
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

// Reproduces Siemens "Consistent message-based communication via OPC UA"
// (Entry-ID 109795979) section 1.3.4 "PLC as a requester": the PLC increments
// a sequence-number tag when a request is ready; the IT side notices the
// change, calls a "get request" method (output: the request payload),
// processes it, then calls a "set response" method (input: the result) -
// using that exact output as this step's input is the part under test here.
describe("PLC-as-requester handshake (Wait-Assert 'changed' + Call Method chaining)", () => {
  it("detects a PLC-incremented sequence tag, reads the request, and echoes a derived response", async () => {
    const serverCertDir = mkdtempSync(join(tmpdir(), "ifsim-server-cert-"));
    const serverCertificateManager = new OPCUACertificateManager({ rootFolder: serverCertDir });
    await serverCertificateManager.initialize();
    const server = new OPCUAServer({ port: 28558, resourcePath: "/UA/PlcRequesterTest", serverCertificateManager });
    await server.initialize();

    const addressSpace = server.engine.addressSpace!;
    const namespace = addressSpace.getOwnNamespace();

    let requestSeq = 0;
    namespace.addVariable({
      organizedBy: addressSpace.rootFolder.objects,
      browseName: "RequestSeq",
      nodeId: "s=RequestSeq",
      dataType: "Int32",
      value: { get: () => new Variant({ dataType: DataType.Int32, value: requestSeq }) },
    });

    let pendingRequestPayload = "";
    let receivedResponsePayload: string | null = null;

    const messageBuffer = namespace.addObject({
      organizedBy: addressSpace.rootFolder.objects,
      browseName: "MessageBuffer",
      nodeId: "s=MessageBuffer",
    });

    const getRequestMethod = namespace.addMethod(messageBuffer, {
      browseName: "GetRequestEnvelope",
      nodeId: "s=GetRequestEnvelope",
      inputArguments: [],
      outputArguments: [{ name: "requestPayload", dataType: "String" }],
    });
    getRequestMethod.bindMethod((_inputArguments: VariantType[], _context: unknown) => {
      return Promise.resolve({
        statusCode: StatusCodes.Good,
        outputArguments: [{ dataType: "String", value: pendingRequestPayload }],
      });
    });

    const setResponseMethod = namespace.addMethod(messageBuffer, {
      browseName: "SetResponseEnvelope",
      nodeId: "s=SetResponseEnvelope",
      inputArguments: [{ name: "responsePayload", dataType: "String" }],
      outputArguments: [],
    });
    setResponseMethod.bindMethod((inputArguments: VariantType[], _context: unknown) => {
      receivedResponsePayload = inputArguments[0].value as string;
      return Promise.resolve({ statusCode: StatusCodes.Good, outputArguments: [] });
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
      const requestSeqNode = topLevel.find((n) => n.displayName === "RequestSeq")!;
      const messageBufferNode = topLevel.find((n) => n.displayName === "MessageBuffer")!;
      const bufferChildren = await browseChildren(session, messageBufferNode.nodeId);
      const getRequestNode = bufferChildren.find((n) => n.displayName === "GetRequestEnvelope")!;
      const setResponseNode = bufferChildren.find((n) => n.displayName === "SetResponseEnvelope")!;

      const requestSeqAttrs = await readNodeAttributes(session, requestSeqNode.nodeId);
      const requestSeqTag: Tag = { id: "tag-seq", alias: "RequestSeq", node: requestSeqAttrs.node, dataType: requestSeqAttrs.dataType };

      const getRequestArgs = await readMethodArguments(session, getRequestNode.nodeId);
      const getRequestRefs = await resolveMethodNodeReferences(session, messageBufferNode.nodeId, getRequestNode.nodeId);
      const getRequestMethodDef: MethodDefinition = {
        id: "method-get-request",
        alias: "GetRequestEnvelope",
        objectNode: getRequestRefs.objectNode,
        methodNode: getRequestRefs.methodNode,
        inputArguments: getRequestArgs.input,
        outputArguments: getRequestArgs.output,
      };

      const setResponseArgs = await readMethodArguments(session, setResponseNode.nodeId);
      const setResponseRefs = await resolveMethodNodeReferences(session, messageBufferNode.nodeId, setResponseNode.nodeId);
      const setResponseMethodDef: MethodDefinition = {
        id: "method-set-response",
        alias: "SetResponseEnvelope",
        objectNode: setResponseRefs.objectNode,
        methodNode: setResponseRefs.methodNode,
        inputArguments: setResponseArgs.input,
        outputArguments: setResponseArgs.output,
      };

      const steps: SequenceStep[] = [
        {
          id: "step-wait-for-request",
          kind: "waitAssert",
          conditionA: {
            subjectSource: "tag",
            tagId: requestSeqTag.id,
            methodSubject: { methodId: null, methodOutputIndex: 0, methodInputArguments: [] },
            comparison: "changed",
            expectedSource: "constant",
            expectedValue: { type: "number", value: 0 },
            expectedTagId: null,
            expectedStepOutput: null,
          },
          conditionB: null,
          combinator: "AND",
          timeoutMs: null,
          pollIntervalMs: 50,
          onTimeout: "fail",
          enabled: true,
        },
        {
          id: "step-get-request",
          kind: "callMethod",
          methodId: getRequestMethodDef.id,
          inputArguments: [],
          enabled: true,
        },
        {
          id: "step-set-response",
          kind: "callMethod",
          methodId: setResponseMethodDef.id,
          inputArguments: [{ source: "stepOutput", stepId: "step-get-request", outputIndex: 0, fieldPath: [] }],
          enabled: true,
        },
      ];

      const engine = new RunEngine();
      const completed = waitForEvent<{ summary: RunSummary }>(engine, "completed", () => true);
      await engine.startRun(session, steps, [requestSeqTag], [getRequestMethodDef, setResponseMethodDef]);

      // Simulate the PLC: a moment after the run starts (so it genuinely
      // observes the "changed" baseline first, not a coincidental head start),
      // write a new request and bump the sequence number.
      await new Promise((resolve) => setTimeout(resolve, 150));
      pendingRequestPayload = "REQUEST:DoSomething:42";
      requestSeq = 1;

      const { summary } = await completed;

      expect(summary.outcome).toBe("passed");
      expect(summary.stepResults.map((r) => r.outcome)).toEqual(["pass", "pass", "pass"]);
      expect(receivedResponsePayload).toBe("REQUEST:DoSomething:42");

      await service.disconnect();
    } finally {
      await server.shutdown();
      await certificateManager.dispose();
      await serverCertificateManager.dispose();
    }
  });
});
