import { ipcMain } from "electron";
import { IpcChannels } from "@shared/ipc-channels";
import type { MethodDefinition } from "@shared/models/method";
import type { TagLiteralValue } from "@shared/models/sequence-step";
import { readMethodArguments, resolveMethodNodeReferences, callMethod } from "../opcua/method-service";
import { resolveNodeIdFromTagReference } from "../opcua/node-id-utils";
import { toVariant, variantToScalar } from "../opcua/value-serialization";
import { OpcUaService } from "../opcua/opcua-service";

export function registerMethodHandlers(opcUaService: OpcUaService): void {
  ipcMain.handle(IpcChannels.Method.ReadArguments, async (_event, objectNodeId: string, methodNodeId: string) => {
    const session = opcUaService.getActiveSession();
    if (!session) {
      throw new Error("Not connected to an OPC UA server");
    }
    const [{ objectNode, methodNode }, { input, output }] = await Promise.all([
      resolveMethodNodeReferences(session, objectNodeId, methodNodeId),
      readMethodArguments(session, methodNodeId),
    ]);
    return { objectNode, methodNode, inputArguments: input, outputArguments: output };
  });

  ipcMain.handle(
    IpcChannels.Method.TestCall,
    async (_event, method: MethodDefinition, inputArguments: TagLiteralValue[]) => {
      const session = opcUaService.getActiveSession();
      if (!session) {
        return { ok: false, error: "Not connected to an OPC UA server" };
      }
      try {
        const objectNodeId = await resolveNodeIdFromTagReference(session, method.objectNode);
        const methodNodeId = await resolveNodeIdFromTagReference(session, method.methodNode);
        const variants = method.inputArguments.map((argumentMeta, index) =>
          toVariant(inputArguments[index].value, argumentMeta.dataType)
        );
        const result = await callMethod(session, objectNodeId, methodNodeId, variants);
        if (!result.isGood) {
          return { ok: false, error: `Method call failed: ${result.statusCodeText}` };
        }
        const outputs = result.outputArguments.map((variant, index) => ({
          name: method.outputArguments[index]?.name ?? String(index),
          display: String(variantToScalar(variant)),
        }));
        return { ok: true, outputs };
      } catch (err) {
        return { ok: false, error: err instanceof Error ? err.message : String(err) };
      }
    }
  );
}
