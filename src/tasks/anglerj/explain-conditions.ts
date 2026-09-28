import { z } from "zod";
import type { TaskDefinition } from "../types.js";

/**
 * Anglerj's safety-state vocabulary is owned by the Anglerj application, not
 * this gateway, and the authoritative enum is not available in this
 * repository. This is intentionally a loosely-constrained contract point
 * (non-empty, bounded-length string) rather than an invented closed enum -
 * hardcoding plausible-looking labels here (e.g. "SAFE"/"CAUTION") would be
 * worse than an open contract, because a wrong-but-plausible enum could
 * silently reject a real Anglerj safety state at runtime. When the actual
 * Anglerj safety-state contract becomes available to this repo (a shared
 * package, an OpenAPI spec, a contract test), replace this with a real
 * z.enum(...) of those exact values. See
 * docs/adr/0003-deterministic-provenance.md and
 * docs/adr/0002-safety-boundary.md.
 */
export const AnglerjSafetyStateSchema = z.string().min(1).max(64);
export type AnglerjSafetyState = z.infer<typeof AnglerjSafetyStateSchema>;

/**
 * The fixed fact payload Anglerj's verified fact layer produces. AnglerjAi
 * may only explain these facts in plain language - it must never invent
 * additional weather, tide, regulation, or safety facts that are not present
 * here. See docs/architecture.md#anglerj-fact-layer.
 */
export const AnglerjConditionsInputSchema = z.object({
  weather: z.object({
    tempF: z.number(),
    windMph: z.number(),
    windDirection: z.string(),
    skyCondition: z.string(),
  }),
  tide: z.object({
    stage: z.enum(["rising", "falling", "high", "low"]),
    nextChangeIso: z.string(),
  }),
  solunar: z.object({
    majorPeriods: z.array(z.string()),
    minorPeriods: z.array(z.string()),
  }),
  pressure: z.object({
    inHg: z.number(),
    trend: z.enum(["rising", "falling", "steady"]),
  }),
  regulations: z.object({
    species: z.string(),
    slotLimitInches: z.string().nullable(),
    dailyBagLimit: z.number().nullable(),
    seasonOpen: z.boolean(),
  }),
  score: z.object({
    value: z.number().min(0).max(100),
    label: z.string(),
  }),
  safety: z.object({
    state: AnglerjSafetyStateSchema,
    note: z.string().nullable(),
  }),
});
export type AnglerjConditionsInput = z.infer<typeof AnglerjConditionsInputSchema>;

export const explainConditionsTask: TaskDefinition<AnglerjConditionsInput, string> = {
  id: "anglerj.explain_conditions",
  description:
    "Explains a pre-computed set of verified fishing conditions in plain language, without inventing new facts, scores, or safety determinations.",
  modality: "text",
  structuredOutput: false,
  inputSchema: AnglerjConditionsInputSchema,
  latency: "balanced",
  cost: "balanced",
  quality: "standard",
  /**
   * SAFETY_EXPLANATION_ONLY, not ADVISORY: this task narrates a safety state
   * (safety.state/safety.note) that deterministic Anglerj application logic
   * already decided. The gateway must never let that narration become the
   * user's only source of the real state - see `extractGroundingFacts`
   * below, which surfaces the authoritative safety/score facts on every
   * result independent of what the model said, and
   * docs/adr/0002-safety-boundary.md.
   */
  safety: "SAFETY_EXPLANATION_ONLY",
  /**
   * Deterministic pass-through, never model-derived: the calling application
   * can render/depend on `result.groundingFacts.safety` and `.score`
   * directly, so user safety never depends on whether the narrative text
   * correctly restated the state.
   */
  extractGroundingFacts: (input) => ({ safety: input.safety, score: input.score }),
  timeoutMs: 15_000,
  maxOutputTokens: 400,
  promptId: "anglerj.explain-conditions.v1",
  maxRepairAttempts: 0,
};
