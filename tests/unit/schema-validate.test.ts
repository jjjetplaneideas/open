import { describe, expect, it } from "vitest";
import { z } from "zod";
import { buildRepairInstruction, validateStructuredOutput } from "../../src/schema/validate.js";

const schema = z.object({ name: z.string(), age: z.number() });

describe("validateStructuredOutput", () => {
  it("accepts JSON that matches the schema", () => {
    const result = validateStructuredOutput(JSON.stringify({ name: "Ada", age: 30 }), schema);
    expect(result.valid).toBe(true);
    if (result.valid) {
      expect(result.data).toEqual({ name: "Ada", age: 30 });
    }
  });

  it("rejects text that is not JSON at all", () => {
    const result = validateStructuredOutput("not json, just an explanation", schema);
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.issues[0]).toMatch(/not valid JSON/);
    }
  });

  it("rejects JSON that parses but fails schema validation, and never accepts it as-is", () => {
    const result = validateStructuredOutput(JSON.stringify({ name: "Ada" }), schema);
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.issues.some((issue) => issue.includes("age"))).toBe(true);
    }
  });
});

describe("buildRepairInstruction", () => {
  it("lists every issue so the model has a concrete correction target", () => {
    const instruction = buildRepairInstruction(["age: Required", "name: Expected string"]);
    expect(instruction).toContain("age: Required");
    expect(instruction).toContain("name: Expected string");
    expect(instruction).toMatch(/JSON only/);
  });
});
