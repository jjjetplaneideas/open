import type { z } from "zod";

export type StructuredValidationResult<T> =
  | { valid: true; data: T }
  | { valid: false; issues: string[]; rawText: string };

/**
 * Parses raw provider text as JSON and validates it against the task's Zod
 * schema. A response is never accepted merely because it "looks like" JSON -
 * both the parse and the schema check must succeed. Returns a discriminated
 * result rather than throwing, so callers (the repair/retry loop) can decide
 * what to do next.
 */
export function validateStructuredOutput<T>(
  rawText: string,
  schema: z.ZodType<T>,
): StructuredValidationResult<T> {
  let parsedJson: unknown;
  try {
    parsedJson = JSON.parse(rawText);
  } catch (error) {
    return { valid: false, issues: [`Response was not valid JSON: ${(error as Error).message}`], rawText };
  }

  const result = schema.safeParse(parsedJson);
  if (result.success) {
    return { valid: true, data: result.data };
  }

  const issues = result.error.issues.map((issue) => `${issue.path.join(".") || "(root)"}: ${issue.message}`);
  return { valid: false, issues, rawText };
}

/** Builds a corrective follow-up message describing exactly what was wrong, for a single bounded repair attempt. */
export function buildRepairInstruction(issues: string[]): string {
  return [
    "Your previous response failed schema validation for these reasons:",
    ...issues.map((issue) => `- ${issue}`),
    "",
    "Respond again with a single corrected JSON object that fixes every issue above. Do not add commentary or markdown - JSON only.",
  ].join("\n");
}
