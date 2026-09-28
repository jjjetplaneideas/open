import { z } from "zod";
import type { TaskDefinition } from "../types.js";

/**
 * Talent Squad's data layer confidence taxonomy. The gateway does not
 * invent this - it is passed through from the source record so the
 * extraction result stays linked to Talent Squad's own provenance model.
 */
export const SourceConfidenceSchema = z.enum([
  "VERIFIED_RECENT",
  "VERIFIED_AGING",
  "STALE",
  "CLOSED",
  "SOURCE_UNAVAILABLE",
  "RECONCILIATION_HOLD",
]);

export const EmploymentTypeSchema = z.enum([
  "full_time",
  "part_time",
  "seasonal",
  "contract",
  "internship",
  "unknown",
]);

const CompensationSchema = z.object({
  /** False when the source text contains no compensation information at all - never guessed. */
  present: z.boolean(),
  raw: z.string().nullable(),
  min: z.number().nullable(),
  max: z.number().nullable(),
  currency: z.string().nullable(),
  period: z.enum(["hour", "year", "shift", "unknown"]).nullable(),
});

export const ExtractJobInputSchema = z.object({
  sourceUrl: z.string().url(),
  sourceTimestamp: z.string().datetime().nullable(),
  sourceConfidence: SourceConfidenceSchema,
  rawText: z.string().min(1).max(20_000),
});
export type ExtractJobInput = z.infer<typeof ExtractJobInputSchema>;

/**
 * Closed set of fields the model is permitted to *derive* rather than copy
 * verbatim (e.g. normalizing "$18-22/hr" into compensation.min/max, or
 * inferring employmentType from wording like "seasonal dockhand" - both
 * called out explicitly in the extraction prompt). This is intentionally
 * conservative: title/employer/department/description/requirements/location
 * are NOT on this list, so the model has no license to "infer" them - they
 * must be extracted verbatim or left null. Source-provenance fields
 * (sourceUrl/sourceTimestamp/sourceConfidence) are not on this list either,
 * and in fact are not part of the model's output schema at all - see
 * docs/adr/0003-deterministic-provenance.md. Extend this enum deliberately;
 * do not widen it just to make a validation error go away.
 */
export const InferableFieldSchema = z.enum([
  "employmentType",
  "compensation.min",
  "compensation.max",
  "compensation.currency",
  "compensation.period",
]);
export type InferableField = z.infer<typeof InferableFieldSchema>;

/**
 * What the MODEL is asked to produce and what gets schema-validated against
 * the provider's raw response. Deliberately excludes sourceUrl/
 * sourceTimestamp/sourceConfidence: those are Talent Squad's authoritative
 * source-record fields, and the model must be structurally incapable of
 * setting or changing them, not merely instructed not to - see
 * `extractJobTask.postProcess` below and docs/adr/0003-deterministic-provenance.md.
 */
export const ModelExtractedJobSchema = z.object({
  title: z.string().nullable(),
  employer: z.string().nullable(),
  location: z.object({
    propertyName: z.string().nullable(),
    city: z.string().nullable(),
    state: z.string().nullable(),
  }),
  department: z.string().nullable(),
  employmentType: EmploymentTypeSchema,
  description: z.string().nullable(),
  compensation: CompensationSchema,
  requirements: z.array(z.string()),
  /** Must reference only fields in InferableFieldSchema - arbitrary strings are rejected, not merely discouraged. */
  inferredFields: z.array(InferableFieldSchema),
});
export type ModelExtractedJob = z.infer<typeof ModelExtractedJobSchema>;

/**
 * The final result returned to callers: the model's extraction plus
 * authoritative provenance attached deterministically in `postProcess`,
 * never by the model. Every field here that also appears in
 * ModelExtractedJobSchema is model-controlled; sourceUrl/sourceTimestamp/
 * sourceConfidence are gateway-controlled and always mirror the validated
 * input exactly, regardless of what the model output.
 */
export const ExtractedJobSchema = ModelExtractedJobSchema.extend({
  sourceUrl: z.string().url(),
  sourceTimestamp: z.string().datetime().nullable(),
  sourceConfidence: SourceConfidenceSchema,
});
export type ExtractedJob = z.infer<typeof ExtractedJobSchema>;

const MODEL_OUTPUT_JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: [
    "title",
    "employer",
    "location",
    "department",
    "employmentType",
    "description",
    "compensation",
    "requirements",
    "inferredFields",
  ],
  properties: {
    title: { type: ["string", "null"] },
    employer: { type: ["string", "null"] },
    location: {
      type: "object",
      additionalProperties: false,
      required: ["propertyName", "city", "state"],
      properties: {
        propertyName: { type: ["string", "null"] },
        city: { type: ["string", "null"] },
        state: { type: ["string", "null"] },
      },
    },
    department: { type: ["string", "null"] },
    employmentType: {
      type: "string",
      enum: ["full_time", "part_time", "seasonal", "contract", "internship", "unknown"],
    },
    description: { type: ["string", "null"] },
    compensation: {
      type: "object",
      additionalProperties: false,
      required: ["present", "raw", "min", "max", "currency", "period"],
      properties: {
        present: { type: "boolean" },
        raw: { type: ["string", "null"] },
        min: { type: ["number", "null"] },
        max: { type: ["number", "null"] },
        currency: { type: ["string", "null"] },
        period: { type: ["string", "null"], enum: ["hour", "year", "shift", "unknown", null] },
      },
    },
    requirements: { type: "array", items: { type: "string" } },
    inferredFields: {
      type: "array",
      items: {
        type: "string",
        enum: ["employmentType", "compensation.min", "compensation.max", "compensation.currency", "compensation.period"],
      },
    },
  },
} as const satisfies Record<string, unknown>;

export const extractJobTask: TaskDefinition<ExtractJobInput, ExtractedJob, ModelExtractedJob> = {
  id: "talentsquad.extract_job",
  description:
    "Extracts a normalized job listing from raw hospitality job-posting text without fabricating missing facts.",
  modality: "text",
  structuredOutput: true,
  inputSchema: ExtractJobInputSchema,
  outputSchema: ModelExtractedJobSchema,
  outputJsonSchema: MODEL_OUTPUT_JSON_SCHEMA,
  /**
   * The model never sees or returns sourceUrl/sourceTimestamp/sourceConfidence
   * (they're excluded from its schema entirely), so there is nothing for it
   * to get wrong, omit, or tamper with. They are attached here from the
   * already-validated input - deterministic code, not a model instruction -
   * which is the actual trust boundary. Merge order matters: these three
   * keys are spread last specifically so they always win.
   */
  postProcess: (modelOutput, input) => ({
    ...modelOutput,
    sourceUrl: input.sourceUrl,
    sourceTimestamp: input.sourceTimestamp,
    sourceConfidence: input.sourceConfidence,
  }),
  latency: "balanced",
  cost: "balanced",
  quality: "standard",
  safety: "NORMAL",
  timeoutMs: 20_000,
  maxOutputTokens: 1_200,
  promptId: "talentsquad.extract-job.v2",
  maxRepairAttempts: 1,
};
