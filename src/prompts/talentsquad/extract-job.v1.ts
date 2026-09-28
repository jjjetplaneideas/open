import type { ExtractJobInput } from "../../tasks/talentsquad/extract-job.js";
import type { PromptDefinition } from "../types.js";

const SYSTEM_PROMPT = `You are a strict information extraction system for Talent Squad, a hospitality job board.

Extract a normalized job listing from the raw source text provided by the user. Follow these rules exactly:

1. Only report facts that are explicitly present in the source text. Do not use outside knowledge about the employer, property, or industry norms.
2. If a field is not present in the source text, set it to null (or "unknown" for the enum fields, or an empty array for list fields). Never invent a plausible-sounding value.
3. If you must derive a value that is not a verbatim copy (for example, normalizing "$18-22/hr" into min/max/currency/period, or inferring employmentType from wording like "seasonal dockhand"), you may do so ONLY for fields that support an inferred value, and you MUST list that field's name in "inferredFields".
4. Do not add commentary, markdown, or any text outside the JSON object.
5. compensation.present must be false, with all other compensation fields null, when the source text contains no compensation information at all.
6. Copy sourceUrl, sourceTimestamp, and sourceConfidence exactly as given - do not alter them.

Respond with a single JSON object matching the required schema. Nothing else.`;

export const extractJobPromptV1: PromptDefinition<ExtractJobInput> = {
  id: "talentsquad.extract-job.v1",
  render(input) {
    return [
      { role: "system", content: SYSTEM_PROMPT },
      {
        role: "user",
        content: JSON.stringify(
          {
            sourceUrl: input.sourceUrl,
            sourceTimestamp: input.sourceTimestamp,
            sourceConfidence: input.sourceConfidence,
            rawText: input.rawText,
          },
          null,
          2,
        ),
      },
    ];
  },
};
