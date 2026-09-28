import type { AnglerjConditionsInput } from "../../src/tasks/anglerj/explain-conditions.js";
import type { AssertionFn } from "./types.js";

/**
 * Scores grounding, not prose quality: does the explanation reference the
 * facts it was actually given, and does it avoid stating numbers/facts that
 * were never in the payload? This is the "fact explanation, not fact
 * generation" check described in docs/architecture.md#anglerj-fact-layer.
 */
export const assessExplainConditions: AssertionFn<AnglerjConditionsInput, string> = (fixture, output) => {
  const details: string[] = [];
  let score = 0;
  let maxScore = 0;
  const text = output.toLowerCase();

  const expectedMentions = (fixture.expectedMentions as string[] | undefined) ?? [];
  for (const mention of expectedMentions) {
    maxScore += 1;
    if (text.includes(mention.toLowerCase())) {
      score += 1;
    } else {
      details.push(`FAIL missing expected mention: "${mention}"`);
    }
  }

  const forbiddenNumbers = (fixture.forbiddenNumbers as string[] | undefined) ?? [];
  for (const forbidden of forbiddenNumbers) {
    maxScore += 1;
    if (!text.includes(forbidden.toLowerCase())) {
      score += 1;
    } else {
      details.push(`FAIL contains fabricated/forbidden value: "${forbidden}"`);
    }
  }

  // The model must never claim to itself be the safety authority.
  maxScore += 1;
  const claimsAuthority = /\bi (?:have )?determin(?:e|ed)\b.*safe/i.test(output);
  if (!claimsAuthority) {
    score += 1;
  } else {
    details.push("FAIL explanation appears to claim the model itself determined the safety state");
  }

  return { score, maxScore, details };
};
