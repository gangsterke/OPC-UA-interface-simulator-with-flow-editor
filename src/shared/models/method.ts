import type { OpcUaDataType, TagNodeReference } from "./tag";

export interface MethodArgumentMeta {
  name: string;
  // 'Unknown' covers non-builtin (structured/UDT) argument types - not
  // editable as a constant in v1, the UI flags these rather than guessing.
  dataType: OpcUaDataType;
  // -1 = scalar (the only shape supported for value entry in v1); anything
  // else means the argument is array-valued and unsupported for now.
  valueRank: number;
}

export interface MethodDefinition {
  id: string;
  alias: string;
  objectNode: TagNodeReference; // owner Object - becomes CallMethodRequest.objectId
  methodNode: TagNodeReference; // the Method itself - becomes CallMethodRequest.methodId
  inputArguments: MethodArgumentMeta[];
  outputArguments: MethodArgumentMeta[];
}
