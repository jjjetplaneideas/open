import type { z } from "zod";
import type {
  CostPreference,
  LatencyPreference,
  Modality,
  QualityTier,
  SafetyClassification,
} from "../types/index.js";

export interface TaskDefinition<TInput = unknown, TOutput = unknown> {
  /** Stable task id, e.g. "talentsquad.extract_job". Applications request this, never a model. */
  id: string;
  description: string;
  modality: Modality;

  /** True for tasks that must return schema-validated JSON rather than free text. */
  structuredOutput: boolean;
  /** Required when structuredOutput is true. */
  outputSchema?: z.ZodType<TOutput>;
  /** JSON-Schema-shaped equivalent handed to providers that support native structured output modes. */
  outputJsonSchema?: Record<string, unknown>;

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

export type AnyTaskDefinition = TaskDefinition<unknown, unknown>;
