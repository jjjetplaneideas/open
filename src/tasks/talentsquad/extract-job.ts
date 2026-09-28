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
 * The normalized job record. Every extracted field is nullable rather than
 * defaulted to an empty string, so "not present in source" is representable
 * and distinguishable from an extracted empty value. `inferredFields` lists
 * any field the model derived rather than copied verbatim - an empty array
 * means every non-null field came straight from the source text.
 */
export const ExtractedJobSchema = z.object({
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
  sourceUrl: z.string().url(),
  sourceTimestamp: z.string().datetime().nullable(),
  compensation: CompensationSchema,
  requirements: z.array(z.string()),
  sourceConfidence: SourceConfidenceSchema,
  /** Field names (dot-path) that were inferred rather than extracted verbatim. Must reference real field names. */
  inferredFields: z.array(z.string()),
});
export type ExtractedJob = z.infer<typeof ExtractedJobSchema>;

export const extractJobTask: TaskDefinition<ExtractJobInput, ExtractedJob> = {
  id: "talentsquad.extract_job",
  description:
    "Extracts a normalized job listing from raw hospitality job-posting text without fabricating missing facts.",
  modality: "text",
  structuredOutput: true,
  inputSchema: ExtractJobInputSchema,
  outputSchema: ExtractedJobSchema,
  outputJsonSchema: {
    type: "object",
    additionalProperties: false,
    required: [
      "title",
      "employer",
      "location",
      "department",
      "employmentType",
      "description",
      "sourceUrl",
      "sourceTimestamp",
      "compensation",
      "requirements",
      "sourceConfidence",
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
      sourceUrl: { type: "string", format: "uri" },
      sourceTimestamp: { type: ["string", "null"], format: "date-time" },
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
      sourceConfidence: {
        type: "string",
        enum: [
          "VERIFIED_RECENT",
          "VERIFIED_AGING",
          "STALE",
          "CLOSED",
          "SOURCE_UNAVAILABLE",
          "RECONCILIATION_HOLD",
        ],
      },
      inferredFields: { type: "array", items: { type: "string" } },
    },
  },
  latency: "balanced",
  cost: "balanced",
  quality: "standard",
  safety: "NORMAL",
  timeoutMs: 20_000,
  maxOutputTokens: 1_200,
  promptId: "talentsquad.extract-job.v1",
  maxRepairAttempts: 1,
};
