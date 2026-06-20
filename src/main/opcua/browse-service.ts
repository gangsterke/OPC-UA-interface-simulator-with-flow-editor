import { browseAll, BrowseDirection, NodeClass, ReferenceTypeIds, AttributeIds, type ClientSession } from "node-opcua";
import type { BrowseTreeNode, OpcUaNodeClass } from "@shared/models/browse-tree-node";
import type { NodeAttributesSummary } from "@shared/models/node-attributes";
import { resolveTagNodeReference } from "./node-id-utils";
import { mapVariantDataType } from "./value-serialization";

// OPC UA Part 3 AccessLevel attribute bitmask (Byte): CurrentRead = 0x01,
// CurrentWrite = 0x02 (HistoryRead/HistoryWrite etc. occupy higher bits, not
// needed here).
const ACCESS_LEVEL_CURRENT_READ = 0x01;
const ACCESS_LEVEL_CURRENT_WRITE = 0x02;

// OPC UA Part 4 BrowseResultMask bitmask: ReferenceTypeId(1) | IsForward(2) |
// NodeClass(4) | BrowseName(8) | DisplayName(16) | TypeDefinition(32) = "All".
// browseAll()'s plain-string convenience form leaves resultMask unset, which
// servers interpret as "return nothing" - browseName/displayName/nodeClass
// all come back empty unless this is set explicitly (verified empirically).
const BROWSE_RESULT_MASK_ALL = 0x3f;

// Restrict to HierarchicalReferences (and subtypes, e.g. Organizes/HasComponent/
// HasProperty) so a folder's HasTypeDefinition reference (e.g. "FolderType")
// doesn't show up as if it were a child node - verified empirically.
const HIERARCHICAL_REFERENCES_NODE_ID = `i=${ReferenceTypeIds.HierarchicalReferences}`;

const NODE_CLASS_NAMES: Record<number, OpcUaNodeClass> = {
  [NodeClass.Unspecified]: "Unspecified",
  [NodeClass.Object]: "Object",
  [NodeClass.Variable]: "Variable",
  [NodeClass.Method]: "Method",
  [NodeClass.ObjectType]: "ObjectType",
  [NodeClass.VariableType]: "VariableType",
  [NodeClass.ReferenceType]: "ReferenceType",
  [NodeClass.DataType]: "DataType",
  [NodeClass.View]: "View",
};

function mapNodeClass(nodeClass: NodeClass): OpcUaNodeClass {
  return NODE_CLASS_NAMES[nodeClass as number] ?? "Unspecified";
}

// Objects (ns=0;i=85) is a well-known, always-present NodeId defined by the
// OPC UA spec itself - no need to query the server to know it exists.
const OBJECTS_FOLDER_NODE_ID = "i=85";

export function resolveRootNode(): BrowseTreeNode {
  return {
    nodeId: OBJECTS_FOLDER_NODE_ID,
    browseName: "Objects",
    displayName: "Objects",
    nodeClass: "Object",
    hasChildrenHint: true,
  };
}

// browseAll() (from node-opcua-pseudo-session, re-exported by node-opcua) loops
// browseNext() internally to drain continuation points, so a folder with
// hundreds of children still comes back as one complete list here - the
// renderer's tree only ever fetches one level at a time, not the whole tree.
export async function browseChildren(session: ClientSession, nodeId: string): Promise<BrowseTreeNode[]> {
  const result = await browseAll(session, {
    nodeId,
    browseDirection: BrowseDirection.Forward,
    referenceTypeId: HIERARCHICAL_REFERENCES_NODE_ID,
    includeSubtypes: true,
    resultMask: BROWSE_RESULT_MASK_ALL,
  });
  if (result.statusCode.isNotGood()) {
    throw new Error(`Browse failed for ${nodeId}: ${result.statusCode.toString()}`);
  }
  return (result.references ?? []).map((ref) => {
    const nodeClass = mapNodeClass(ref.nodeClass);
    return {
      nodeId: ref.nodeId.toString(),
      browseName: ref.browseName.toString(),
      displayName: ref.displayName.text || ref.browseName.toString(),
      nodeClass,
      hasChildrenHint: nodeClass !== "Variable" && nodeClass !== "Method",
    };
  });
}

// Reads the Value attribute (not the DataType attribute, which would only
// give a NodeId reference into the type system) to get the Variant's own
// built-in DataType directly - simpler and sufficient for the basic
// Boolean/Int/Float-style tags this app targets.
export async function readNodeAttributes(session: ClientSession, nodeId: string): Promise<NodeAttributesSummary> {
  const [valueResult, accessLevelResult] = await session.read([
    { nodeId, attributeId: AttributeIds.Value },
    { nodeId, attributeId: AttributeIds.AccessLevel },
  ]);

  const dataType = mapVariantDataType(valueResult.value?.dataType);
  const accessLevelByte = typeof accessLevelResult.value?.value === "number" ? accessLevelResult.value.value : 0;
  const node = await resolveTagNodeReference(session, nodeId);

  return {
    dataType,
    accessLevel: {
      currentRead: (accessLevelByte & ACCESS_LEVEL_CURRENT_READ) !== 0,
      currentWrite: (accessLevelByte & ACCESS_LEVEL_CURRENT_WRITE) !== 0,
    },
    node,
  };
}
