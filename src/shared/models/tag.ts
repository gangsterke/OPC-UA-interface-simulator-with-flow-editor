export type OpcUaDataType =
  | "Boolean"
  | "SByte"
  | "Byte"
  | "Int16"
  | "UInt16"
  | "Int32"
  | "UInt32"
  | "Int64"
  | "UInt64"
  | "Float"
  | "Double"
  | "String"
  | "DateTime"
  | "ByteString"
  | "Guid"
  | "Unknown";

// NodeId portability across servers: the numeric namespace index is only
// stable for one server instance/session - the namespace URI is the actual
// portable identity (resolved from the server's NamespaceArray at drop time).
// namespaceIndexHint is a fast-path cache, re-resolved against the live
// server's NamespaceArray whenever a project is (re)connected.
export interface TagNodeReference {
  namespaceUri: string;
  namespaceIndexHint: number;
  identifierType: "numeric" | "string" | "guid" | "opaque";
  identifier: string;
}

export interface Tag {
  id: string;
  alias: string;
  node: TagNodeReference;
  dataType: OpcUaDataType;
  description?: string;
}
