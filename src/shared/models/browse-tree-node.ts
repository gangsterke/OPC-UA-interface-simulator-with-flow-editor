export type OpcUaNodeClass =
  | "Unspecified"
  | "Object"
  | "Variable"
  | "Method"
  | "ObjectType"
  | "VariableType"
  | "ReferenceType"
  | "DataType"
  | "View";

export interface BrowseTreeNode {
  nodeId: string;
  browseName: string;
  displayName: string;
  nodeClass: OpcUaNodeClass;
  // A hint only (Objects/Types usually have children, Variables/Methods usually
  // don't) - not a guarantee, to avoid an extra round trip per node just to find
  // out. The actual children (possibly empty) are always fetched lazily on expand.
  hasChildrenHint: boolean;
}
