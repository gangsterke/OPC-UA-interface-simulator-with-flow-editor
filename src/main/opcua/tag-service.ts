import { AttributeIds, type ClientSession } from "node-opcua";
import type { TagNodeReference } from "@shared/models/tag";
import type { TagValueDto } from "@shared/models/node-attributes";
import { toTagValueDto } from "./value-serialization";
import { resolveNodeIdFromTagReference } from "./node-id-utils";

export async function readTagValue(session: ClientSession, reference: TagNodeReference): Promise<TagValueDto> {
  const nodeId = await resolveNodeIdFromTagReference(session, reference);
  const dataValue = await session.read({ nodeId, attributeId: AttributeIds.Value });
  return toTagValueDto(dataValue);
}
