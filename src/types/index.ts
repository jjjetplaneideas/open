/**
 * Shared primitive types used across the task registry, provider adapters,
 * and router. Keeping these in one place is what lets application code stay
 * ignorant of which provider/model actually serviced a task.
 */

export type Modality = "text" | "multimodal";

export type CostPreference = "cost" | "balanced" | "accuracy";
export type LatencyPreference = "fast" | "balanced" | "tolerant";
export type QualityTier = "draft" | "standard" | "premium";

/**
 * Safety classification for a task. This is a hard architectural boundary,
 * not a hint: SAFETY_EXPLANATION_ONLY tasks may only narrate a decision that
 * deterministic application code already made (e.g. BoltBeacon's lightning
 * state, Anglerj's safety score). The gateway must never let an LLM become
 * the source of truth for that decision - see docs/adr/0002-safety-boundary.md.
 */
export type SafetyClassification =
  | "NORMAL"
  | "ADVISORY"
  | "SAFETY_EXPLANATION_ONLY"
  | "HIGH_RISK";

export interface ProviderModelRef {
  provider: string;
  model: string;
}

export interface RequestMetadata {
  application?: string;
  requestId?: string;
  /** Opt-in per-request flag; the gateway may still refuse if the deployment disables content logging globally. */
  allowFullContentLogging?: boolean;
}
