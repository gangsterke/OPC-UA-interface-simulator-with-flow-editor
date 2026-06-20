import { z } from "zod";

const tagLiteralValueSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("boolean"), value: z.boolean() }),
  z.object({ type: z.literal("number"), value: z.number() }),
  z.object({ type: z.literal("string"), value: z.string() }),
  z.object({ type: z.literal("int64"), value: z.string() }),
]);

const tagNodeReferenceSchema = z.object({
  namespaceUri: z.string(),
  namespaceIndexHint: z.number(),
  identifierType: z.enum(["numeric", "string", "guid", "opaque"]),
  identifier: z.string(),
});

const opcUaDataTypeSchema = z.enum([
  "Boolean",
  "SByte",
  "Byte",
  "Int16",
  "UInt16",
  "Int32",
  "UInt32",
  "Int64",
  "UInt64",
  "Float",
  "Double",
  "String",
  "DateTime",
  "ByteString",
  "Guid",
  "Unknown",
]);

const tagSchema = z.object({
  id: z.string(),
  alias: z.string(),
  node: tagNodeReferenceSchema,
  dataType: opcUaDataTypeSchema,
  description: z.string().optional(),
});

const waitConditionSchema = z.object({
  tagId: z.string().nullable(),
  comparison: z.enum(["equals", "notEquals", "tolerance", "greaterThan", "lessThan"]),
  expectedSource: z.enum(["constant", "tag"]),
  expectedValue: tagLiteralValueSchema,
  expectedTagId: z.string().nullable(),
  tolerance: z.number().optional(),
  toleranceMode: z.enum(["absolute", "percent"]).optional(),
});

const sequenceStepBaseSchema = {
  id: z.string(),
  label: z.string().optional(),
  enabled: z.boolean(),
};

const writeStepSchema = z.object({
  ...sequenceStepBaseSchema,
  kind: z.literal("write"),
  tagId: z.string().nullable(),
  value: tagLiteralValueSchema,
});

const waitAssertStepSchema = z.object({
  ...sequenceStepBaseSchema,
  kind: z.literal("waitAssert"),
  conditionA: waitConditionSchema,
  conditionB: waitConditionSchema.nullable(),
  combinator: z.enum(["AND", "OR"]),
  timeoutMs: z.number().nullable(),
  pollIntervalMs: z.number(),
  onTimeout: z.enum(["fail", "failAndContinue"]),
});

const delayStepSchema = z.object({
  ...sequenceStepBaseSchema,
  kind: z.literal("delay"),
  durationMs: z.number(),
});

const sequenceStepSchema = z.discriminatedUnion("kind", [writeStepSchema, waitAssertStepSchema, delayStepSchema]);

const authenticationModeSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("anonymous") }),
  z.object({ kind: z.literal("usernamePassword"), username: z.string(), password: z.string() }),
]);

const connectionProfileSchema = z.object({
  id: z.string(),
  name: z.string(),
  endpointUrl: z.string(),
  securityPolicy: z.enum([
    "None",
    "Basic128Rsa15",
    "Basic256",
    "Basic256Sha256",
    "Aes128_Sha256_RsaOaep",
    "Aes256_Sha256_RsaPss",
  ]),
  securityMode: z.enum(["None", "Sign", "SignAndEncrypt"]),
  authentication: authenticationModeSchema,
});

const projectMetadataSchema = z.object({
  schemaVersion: z.number(),
  createdAt: z.string(),
  modifiedAt: z.string(),
  appVersionAtSave: z.string(),
});

export const projectSchema = z.object({
  metadata: projectMetadataSchema,
  connectionProfile: connectionProfileSchema,
  tags: z.array(tagSchema),
  sequence: z.array(sequenceStepSchema),
});
