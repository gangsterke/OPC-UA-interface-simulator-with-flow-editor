import type { OpcUaDataType, TagNodeReference } from "./tag";

export interface NodeAttributesSummary {
  dataType: OpcUaDataType;
  accessLevel: { currentRead: boolean; currentWrite: boolean };
  node: TagNodeReference;
}

export interface TagValueDto {
  dataType: OpcUaDataType;
  value: string | number | boolean | null;
  sourceTimestamp: string | null;
  statusCode: { name: string; description: string };
}
