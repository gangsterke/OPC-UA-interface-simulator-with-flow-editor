import { coerceNodeId, NodeIdType, AttributeIds, VariableIds, type ClientSession } from "node-opcua";
import type { TagNodeReference } from "@shared/models/tag";

const IDENTIFIER_TYPE_NAMES: Record<number, TagNodeReference["identifierType"]> = {
  [NodeIdType.NUMERIC]: "numeric",
  [NodeIdType.STRING]: "string",
  [NodeIdType.GUID]: "guid",
  [NodeIdType.BYTESTRING]: "opaque",
};

const IDENTIFIER_TYPE_PREFIXES: Record<TagNodeReference["identifierType"], string> = {
  numeric: "i",
  string: "s",
  guid: "g",
  opaque: "b",
};

async function readNamespaceArray(session: ClientSession): Promise<string[]> {
  const namespaceArrayValue = await session.read({
    nodeId: `ns=0;i=${VariableIds.Server_NamespaceArray}`,
    attributeId: AttributeIds.Value,
  });
  return namespaceArrayValue.value?.value ?? [];
}

// Resolves a session-local NodeId string (e.g. "ns=1;s=Temperature") into a
// portable TagNodeReference by looking up the live server's NamespaceArray -
// namespaceUri is the stable identity; namespaceIndexHint is just a cache of
// today's numeric index, which can differ on a different server/restart.
export async function resolveTagNodeReference(
  session: ClientSession,
  nodeIdString: string
): Promise<TagNodeReference> {
  const nodeId = coerceNodeId(nodeIdString);
  const namespaceArray = await readNamespaceArray(session);
  const namespaceUri = namespaceArray[nodeId.namespace] ?? "";
  return {
    namespaceUri,
    namespaceIndexHint: nodeId.namespace,
    identifierType: IDENTIFIER_TYPE_NAMES[nodeId.identifierType] ?? "string",
    identifier: String(nodeId.value),
  };
}

// The inverse: turns a portable TagNodeReference back into a session-local
// NodeId string usable for read()/write() against the currently connected
// server - re-resolving the namespace index fresh each time rather than
// trusting namespaceIndexHint, since it can drift between servers/restarts.
export async function resolveNodeIdFromTagReference(
  session: ClientSession,
  reference: TagNodeReference
): Promise<string> {
  const namespaceArray = await readNamespaceArray(session);
  const namespaceIndex = namespaceArray.indexOf(reference.namespaceUri);
  if (namespaceIndex === -1) {
    throw new Error(`Namespace URI not found on the connected server: ${reference.namespaceUri}`);
  }
  const prefix = IDENTIFIER_TYPE_PREFIXES[reference.identifierType];
  return `ns=${namespaceIndex};${prefix}=${reference.identifier}`;
}
