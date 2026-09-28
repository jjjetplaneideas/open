import { InvalidInputError } from "../inference/errors.js";
import { extractJobPromptV1 } from "./talentsquad/extract-job.v1.js";
import { explainConditionsPromptV1 } from "./anglerj/explain-conditions.v1.js";
import type { PromptDefinition } from "./types.js";

const PROMPTS: Record<string, PromptDefinition<unknown>> = {
  [extractJobPromptV1.id]: extractJobPromptV1 as PromptDefinition<unknown>,
  [explainConditionsPromptV1.id]: explainConditionsPromptV1 as PromptDefinition<unknown>,
};

export function getPrompt(promptId: string): PromptDefinition<unknown> {
  const prompt = PROMPTS[promptId];
  if (!prompt) {
    throw new InvalidInputError(`Prompt "${promptId}" is not registered.`);
  }
  return prompt;
}
