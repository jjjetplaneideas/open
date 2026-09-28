import { InvalidInputError } from "../inference/errors.js";
import { extractJobPromptV1 } from "./talentsquad/extract-job.v1.js";
import { extractJobPromptV2 } from "./talentsquad/extract-job.v2.js";
import { explainConditionsPromptV1 } from "./anglerj/explain-conditions.v1.js";
import type { PromptDefinition } from "./types.js";

/**
 * Every prompt version ever used by a task stays registered here, even after
 * a task moves to a newer version (e.g. extract-job.v1, superseded by .v2) -
 * old inference/benchmark records reference a promptVersion and should stay
 * resolvable for reproducibility. Only remove an entry if you are certain no
 * historical record depends on it.
 */
const PROMPTS: Record<string, PromptDefinition<unknown>> = {
  [extractJobPromptV1.id]: extractJobPromptV1 as PromptDefinition<unknown>,
  [extractJobPromptV2.id]: extractJobPromptV2 as PromptDefinition<unknown>,
  [explainConditionsPromptV1.id]: explainConditionsPromptV1 as PromptDefinition<unknown>,
};

export function getPrompt(promptId: string): PromptDefinition<unknown> {
  const prompt = PROMPTS[promptId];
  if (!prompt) {
    throw new InvalidInputError(`Prompt "${promptId}" is not registered.`);
  }
  return prompt;
}
