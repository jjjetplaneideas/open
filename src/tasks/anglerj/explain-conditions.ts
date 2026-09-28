import { z } from "zod";
import type { TaskDefinition } from "../types.js";

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
    state: z.string(),
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
  // ADVISORY: the model explains a fishing-condition score, it does not decide safety.
  safety: "ADVISORY",
  timeoutMs: 15_000,
  maxOutputTokens: 400,
  promptId: "anglerj.explain-conditions.v1",
  maxRepairAttempts: 0,
};
