import { describe, expect, it } from "vitest";
import { MockProvider } from "../../src/providers/mock/mock-provider.js";

describe("MockProvider", () => {
  const provider = new MockProvider();

  it("is always configured and healthy, so the gateway runs with zero external credentials", async () => {
    expect(provider.isConfigured()).toBe(true);
    expect(await provider.healthCheck()).toEqual({ healthy: true });
  });

  it("generate() echoes back a deterministic acknowledgement", async () => {
    const result = await provider.generate({
      model: "mock-text-v1",
      messages: [{ role: "user", content: "hello" }],
      timeoutMs: 1000,
    });
    expect(result.text).toContain("mock-text-v1");
    expect(result.usage.outputTokens).toBeGreaterThan(0);
  });

  it("generateStructured() returns JSON that conforms to the given schema", async () => {
    const jsonSchema = {
      type: "object",
      properties: {
        title: { type: ["string", "null"] },
        count: { type: "number" },
        tags: { type: "array", items: { type: "string" } },
        kind: { type: "string", enum: ["a", "b"] },
      },
    };
    const result = await provider.generateStructured({
      model: "mock-structured-v1",
      messages: [{ role: "user", content: "extract" }],
      timeoutMs: 1000,
      jsonSchema,
      schemaName: "test_schema",
    });
    const parsed = JSON.parse(result.text);
    expect(parsed).toEqual({ title: null, count: 0, tags: [], kind: "a" });
  });
});
