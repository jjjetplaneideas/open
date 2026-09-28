import type { ExtractedJob, ExtractJobInput } from "../../src/tasks/talentsquad/extract-job.js";
import type { AssertionFn } from "./types.js";

/**
 * Scores extraction correctness against a fixture's expectations - not just
 * "did JSON parse". Every checked expectation is worth one point; the score
 * is (points earned)/(points possible) so fixtures with more assertions
 * aren't unfairly weighted against simpler ones.
 */
export const assessExtractJob: AssertionFn<ExtractJobInput, ExtractedJob> = (fixture, output) => {
  const expected = (fixture.expected ?? {}) as Record<string, unknown>;
  const details: string[] = [];
  let score = 0;
  let maxScore = 0;

  const check = (label: string, pass: boolean, note?: string) => {
    maxScore += 1;
    if (pass) {
      score += 1;
    } else {
      details.push(`FAIL ${label}${note ? `: ${note}` : ""}`);
    }
  };

  if ("title" in expected) check("title", output.title === expected.title, `got ${JSON.stringify(output.title)}`);
  if ("employer" in expected)
    check("employer", output.employer === expected.employer, `got ${JSON.stringify(output.employer)}`);
  if ("department" in expected)
    check("department", output.department === expected.department, `got ${JSON.stringify(output.department)}`);
  if ("employmentType" in expected)
    check(
      "employmentType",
      output.employmentType === expected.employmentType,
      `got ${output.employmentType}`,
    );
  if ("sourceConfidence" in expected)
    check("sourceConfidence", output.sourceConfidence === expected.sourceConfidence);
  if ("compensationPresent" in expected)
    check("compensation.present", output.compensation.present === expected.compensationPresent);
  if ("compensationMin" in expected)
    check("compensation.min", output.compensation.min === expected.compensationMin);
  if ("compensationMax" in expected)
    check("compensation.max", output.compensation.max === expected.compensationMax);
  if ("compensationPeriod" in expected)
    check("compensation.period", output.compensation.period === expected.compensationPeriod);
  if ("minRequirementsCount" in expected)
    check(
      "requirements.length",
      output.requirements.length >= (expected.minRequirementsCount as number),
      `got ${output.requirements.length}`,
    );

  const mustBeNullFields = (expected.mustBeNullFields as string[] | undefined) ?? [];
  for (const field of mustBeNullFields) {
    check(`${field} is null`, (output as unknown as Record<string, unknown>)[field] === null);
  }

  const mustNotInferFields = (expected.mustNotInferFields as string[] | undefined) ?? [];
  for (const field of mustNotInferFields) {
    check(`${field} not inferred`, !output.inferredFields.includes(field));
  }

  // Always-on grounding check: the model must never alter provenance fields it was given verbatim.
  check("sourceUrl unchanged", output.sourceUrl === fixture.input.sourceUrl);
  check("sourceConfidence passthrough", output.sourceConfidence === fixture.input.sourceConfidence);

  return { score, maxScore, details };
};
