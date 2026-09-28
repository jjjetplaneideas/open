import type { z } from "zod";
import type {
  CostPreference,
  LatencyPreference,
  Modality,
  QualityTier,
  SafetyClassification,
} from "../types/index.js";

export interface TaskDefinition<TInput = unknown, TOutput = unknown, TModelOutput = TOutput> {
  /** Stable task id, e.g. "talentsquad.extract_job". Applications request this, never a model. */
  id: string;
  description: string;
  modality: Modality;

  /** True for tasks that must return schema-validated JSON rather than free text. */
  structuredOutput: boolean;
  /**
   * Required when structuredOutput is true. Validates the MODEL's raw
   * response, which may be a narrower shape than the task's final result
   * type (TOutput) - see `postProcess`. Authoritative fields the model must
   * never control (source provenance, deterministic IDs, etc.) should not
   * appear in this schema at all.
   */
  outputSchema?: z.ZodType<TModelOutput>;
  /** JSON-Schema-shaped equivalent handed to providers that support native structured output modes. Mirrors outputSchema, not the final TOutput shape. */
  outputJsonSchema?: Record<string, unknown>;

  /**
   * Runs after the model's raw output passes schema validation, before the
   * result is returned to the caller, logged, or scored by a benchmark
   * assertion. Use this to attach authoritative fields the model must be
   * structurally incapable of controlling (e.g. Talent Squad's sourceUrl/
   * sourceTimestamp/sourceConfidence) by merging them in from the validated
   * input here, in deterministic code, rather than trusting the model to
   * copy them correctly. See docs/adr/0003-deterministic-provenance.md.
   * Omit when the model's raw output IS the final result (TModelOutput ==
   * TOutput and no authoritative fields need attaching).
   */
  postProcess?: (modelOutput: TModelOutput, input: TInput) => TOutput;

  /**
   * Computes facts the application should treat as authoritative,
   * independent of anything the model said - e.g. Anglerj's real safety
   * state and score, so the calling application never has to trust an LLM
   * narrative to correctly restate a safety-critical value. Derived purely
   * from the validated input, never from model output. Surfaced on the
   * result as `groundingFacts` alongside (not instead of) the model's
   * narrative/result.
   */
  extractGroundingFacts?: (input: TInput) => Record<string, unknown>;

  inputSchema: z.ZodType<TInput>;

  latency: LatencyPreference;
  cost: CostPreference;
  quality: QualityTier;
  safety: SafetyClassification;

  /**
   * Architectural constraint, not a routing decision: which provider ids
   * this task is allowed to run on at all (e.g. a HIGH_RISK task might be
   * restricted to audited providers). Omit to allow any registered
   * provider. This is deliberately separate from *which* of the allowed
   * providers is primary/fallback right now - that lives in
   * src/router/route-config.ts so ops can change models without touching
   * this file. See docs/adding-a-task.md and docs/architecture.md#routing.
   */
  allowedProviders?: string[];

  timeoutMs: number;
  maxOutputTokens: number;

  /** Identifies which versioned prompt (see src/prompts) renders this task's messages. */
  promptId: string;

  /** How many repair/retry attempts are allowed when structured output fails validation. */
  maxRepairAttempts: number;
}

export type AnyTaskDefinition = TaskDefinition<unknown, unknown, unknown>;
