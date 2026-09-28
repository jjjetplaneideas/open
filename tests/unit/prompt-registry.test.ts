import { describe, expect, it } from "vitest";
import { InvalidInputError } from "../../src/inference/errors.js";
import { getPrompt } from "../../src/prompts/registry.js";

describe("prompt registry", () => {
  it("resolves a versioned prompt id and renders messages", () => {
    const prompt = getPrompt("talentsquad.extract-job.v1");
    expect(prompt.id).toBe("talentsquad.extract-job.v1");
    const messages = prompt.render({
      sourceUrl: "https://example.com/job/1",
      sourceTimestamp: null,
      sourceConfidence: "VERIFIED_RECENT",
      rawText: "Cook wanted",
    } as never);
    expect(messages[0]?.role).toBe("system");
    expect(messages[1]?.role).toBe("user");
  });

  it("rejects an unversioned or unknown prompt id", () => {
    expect(() => getPrompt("talentsquad.extract-job")).toThrow(InvalidInputError);
    expect(() => getPrompt("talentsquad.extract-job.v99")).toThrow(InvalidInputError);
  });
});
