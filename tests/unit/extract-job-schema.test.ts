import { describe, expect, it } from "vitest";
import {
  ExtractedJobSchema,
  InferableFieldSchema,
  ModelExtractedJobSchema,
  extractJobTask,
  type ModelExtractedJob,
} from "../../src/tasks/talentsquad/extract-job.js";

const validModelOutput: ModelExtractedJob = {
  title: "Line Cook",
  employer: "Salty Pelican Tiki Bar",
  location: { propertyName: null, city: null, state: null },
  department: null,
  employmentType: "seasonal",
  description: null,
  compensation: { present: false, raw: null, min: null, max: null, currency: null, period: null },
  requirements: [],
  inferredFields: ["employmentType"],
};

describe("ModelExtractedJobSchema", () => {
  it("accepts a well-formed model response with no provenance fields", () => {
    const result = ModelExtractedJobSchema.safeParse(validModelOutput);
    expect(result.success).toBe(true);
  });

  it("does not require or define sourceUrl/sourceTimestamp/sourceConfidence at all", () => {
    expect(Object.keys(ModelExtractedJobSchema.shape)).not.toContain("sourceUrl");
    expect(Object.keys(ModelExtractedJobSchema.shape)).not.toContain("sourceTimestamp");
    expect(Object.keys(ModelExtractedJobSchema.shape)).not.toContain("sourceConfidence");
  });

  it("rejects an inferredFields entry outside the closed InferableFieldSchema enum", () => {
    const result = ModelExtractedJobSchema.safeParse({ ...validModelOutput, inferredFields: ["title"] });
    expect(result.success).toBe(false);
  });

  it("rejects sourceUrl/sourceConfidence smuggled in as an inferredFields entry", () => {
    for (const smuggled of ["sourceUrl", "sourceTimestamp", "sourceConfidence"]) {
      const result = ModelExtractedJobSchema.safeParse({ ...validModelOutput, inferredFields: [smuggled] });
      expect(result.success).toBe(false);
    }
  });

  it("accepts every legitimate InferableFieldSchema value", () => {
    for (const field of InferableFieldSchema.options) {
      const result = ModelExtractedJobSchema.safeParse({ ...validModelOutput, inferredFields: [field] });
      expect(result.success).toBe(true);
    }
  });
});

describe("ExtractedJobSchema (final, includes authoritative provenance)", () => {
  it("extends the model schema with sourceUrl/sourceTimestamp/sourceConfidence", () => {
    const result = ExtractedJobSchema.safeParse({
      ...validModelOutput,
      sourceUrl: "https://example.com/job/1",
      sourceTimestamp: "2026-09-20T14:00:00.000Z",
      sourceConfidence: "VERIFIED_RECENT",
    });
    expect(result.success).toBe(true);
  });
});

describe("extractJobTask.postProcess", () => {
  const input = {
    sourceUrl: "https://example.com/job/1",
    sourceTimestamp: "2026-09-20T14:00:00.000Z",
    sourceConfidence: "VERIFIED_RECENT" as const,
    rawText: "Line Cook wanted, seasonal.",
  };

  it("attaches provenance from input, independent of the model output", () => {
    const result = extractJobTask.postProcess?.(validModelOutput, input);
    expect(result?.sourceUrl).toBe(input.sourceUrl);
    expect(result?.sourceTimestamp).toBe(input.sourceTimestamp);
    expect(result?.sourceConfidence).toBe(input.sourceConfidence);
    // Model-controlled fields pass through untouched.
    expect(result?.title).toBe(validModelOutput.title);
  });
});
