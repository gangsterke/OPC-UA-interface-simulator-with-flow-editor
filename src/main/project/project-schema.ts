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

const methodArgumentMetaSchema = z.object({
  name: z.string(),
  dataType: opcUaDataTypeSchema,
  valueRank: z.number(),
});

const methodDefinitionSchema = z.object({
  id: z.string(),
  alias: z.string(),
  objectNode: tagNodeReferenceSchema,
  methodNode: tagNodeReferenceSchema,
  inputArguments: z.array(methodArgumentMetaSchema),
  outputArguments: z.array(methodArgumentMetaSchema),
});

const stepOutputRefSchema = z.object({
  stepId: z.string().nullable(),
  outputIndex: z.number(),
  // Added alongside field-path drilling into structured outputs - default []
  // for project files saved before this existed, meaning "use the captured
  // output value as-is" (preserves the original whole-output passthrough).
  fieldPath: z.array(z.string()).default([]),
});

const valueSourceSchema = z.discriminatedUnion("source", [
  z.object({ source: z.literal("constant"), value: tagLiteralValueSchema }),
  z.object({
    source: z.literal("tag"),
    tagId: z.string().nullable(),
    // Added alongside field-path drilling into structured/array tag values -
    // default [] for project files saved before this existed, meaning "use
    // the tag's live value as-is".
    fieldPath: z.array(z.string()).default([]),
  }),
  z.object({ source: z.literal("stepOutput"), ...stepOutputRefSchema.shape }),
]);

// Kept as a separate name for call sites written against method arguments
// specifically; identical schema underneath.
const methodArgumentValueSourceSchema = valueSourceSchema;

const methodCallSubjectSchema = z.object({
  methodId: z.string().nullable(),
  methodOutputIndex: z.number(),
  methodInputArguments: z.array(valueSourceSchema),
});

const waitConditionSchema = z.object({
  // Added alongside method-call subjects - default "tag" for project files
  // saved before this existed, preserving the original tag-only behavior.
  subjectSource: z.enum(["tag", "method"]).default("tag"),
  tagId: z.string().nullable(),
  // Added alongside method-call subjects - default for project files saved
  // before this existed (subjectSource is always "tag" for those, so this
  // is simply unused).
  methodSubject: methodCallSubjectSchema.default({ methodId: null, methodOutputIndex: 0, methodInputArguments: [] }),
  comparison: z.enum(["equals", "notEquals", "tolerance", "greaterThan", "lessThan", "changed"]),
  expectedSource: z.enum(["constant", "tag", "stepOutput"]),
  expectedValue: tagLiteralValueSchema,
  expectedTagId: z.string().nullable(),
  // Added alongside stepOutput-sourced expected values - default null for
  // project files saved before this existed.
  expectedStepOutput: stepOutputRefSchema.nullable().default(null),
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
  // Project files saved before this feature existed store `value` as a bare
  // TagLiteralValue ({type, value}); migrate it into the new ValueSource
  // shape by wrapping it as a constant. New files already store a
  // ValueSource directly ({source, ...}).
  value: z
    .union([tagLiteralValueSchema, valueSourceSchema])
    .transform((v) => ("source" in v ? v : { source: "constant" as const, value: v })),
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

const callMethodStepSchema = z.object({
  ...sequenceStepBaseSchema,
  kind: z.literal("callMethod"),
  methodId: z.string().nullable(),
  inputArguments: z.array(methodArgumentValueSourceSchema),
});

const sequenceStepSchema = z.discriminatedUnion("kind", [
  writeStepSchema,
  waitAssertStepSchema,
  delayStepSchema,
  callMethodStepSchema,
]);

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
  // Added after schemaVersion 1 shipped - default to [] so project files
  // saved before this feature existed (which simply don't have the field)
  // still load instead of failing validation.
  methods: z.array(methodDefinitionSchema).default([]),
  sequence: z.array(sequenceStepSchema),
});
