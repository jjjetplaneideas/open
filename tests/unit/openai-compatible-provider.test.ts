import { afterEach, describe, expect, it, vi } from "vitest";
import { ProviderError, ProviderNotConfiguredError, ProviderTimeoutError } from "../../src/inference/errors.js";
import { OpenAICompatibleProvider } from "../../src/providers/openai-compatible-base.js";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

describe("OpenAICompatibleProvider", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it("throws ProviderNotConfiguredError when no API key is set, without making a network call", async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    const provider = new OpenAICompatibleProvider({ id: "openai", apiKey: "", baseUrl: "https://api.openai.com/v1" });

    await expect(
      provider.generate({ model: "gpt-4o-mini", messages: [{ role: "user", content: "hi" }], timeoutMs: 1000 }),
    ).rejects.toThrow(ProviderNotConfiguredError);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("parses a successful chat completion response", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        jsonResponse({
          model: "gpt-4o-mini-2024-07-18",
          choices: [{ message: { content: "hello there" } }],
          usage: { prompt_tokens: 10, completion_tokens: 3 },
        }),
      ),
    );
    const provider = new OpenAICompatibleProvider({ id: "openai", apiKey: "sk-test", baseUrl: "https://api.openai.com/v1" });

    const result = await provider.generate({ model: "gpt-4o-mini", messages: [{ role: "user", content: "hi" }], timeoutMs: 1000 });

    expect(result.text).toBe("hello there");
    expect(result.resolvedModel).toBe("gpt-4o-mini-2024-07-18");
    expect(result.usage).toEqual({ inputTokens: 10, outputTokens: 3 });
  });

  it("maps a 429 response to a retryable ProviderError without leaking the response body to the thrown message", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("rate limited, key sk-secret-abc", { status: 429 })));
    const provider = new OpenAICompatibleProvider({ id: "openai", apiKey: "sk-test", baseUrl: "https://api.openai.com/v1" });

    const promise = provider.generate({ model: "gpt-4o-mini", messages: [{ role: "user", content: "hi" }], timeoutMs: 1000 });
    await expect(promise).rejects.toThrow(ProviderError);
    await promise.catch((error: ProviderError) => {
      expect(error.retryable).toBe(true);
      expect(error.message).not.toContain("sk-secret-abc");
    });
  });

  it("maps a 400 response to a non-retryable ProviderError", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("bad request", { status: 400 })));
    const provider = new OpenAICompatibleProvider({ id: "openai", apiKey: "sk-test", baseUrl: "https://api.openai.com/v1" });

    await provider
      .generate({ model: "gpt-4o-mini", messages: [{ role: "user", content: "hi" }], timeoutMs: 1000 })
      .catch((error: ProviderError) => {
        expect(error.retryable).toBe(false);
      });
  });

  it("aborts and raises ProviderTimeoutError when the provider does not respond in time", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation((_url: string, init: RequestInit) => {
        return new Promise((_resolve, reject) => {
          init.signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")));
        });
      }),
    );
    const provider = new OpenAICompatibleProvider({ id: "openai", apiKey: "sk-test", baseUrl: "https://api.openai.com/v1" });

    await expect(
      provider.generate({ model: "gpt-4o-mini", messages: [{ role: "user", content: "hi" }], timeoutMs: 10 }),
    ).rejects.toThrow(ProviderTimeoutError);
  });

  it("sends a json_schema response_format for structured generation", async () => {
    const fetchSpy = vi.fn().mockResolvedValue(
      jsonResponse({ choices: [{ message: { content: "{}" } }], usage: {} }),
    );
    vi.stubGlobal("fetch", fetchSpy);
    const provider = new OpenAICompatibleProvider({ id: "openai", apiKey: "sk-test", baseUrl: "https://api.openai.com/v1" });

    await provider.generateStructured({
      model: "gpt-4o-mini",
      messages: [{ role: "user", content: "extract" }],
      timeoutMs: 1000,
      jsonSchema: { type: "object", properties: {} },
      schemaName: "my_schema",
    });

    const requestBody = JSON.parse((fetchSpy.mock.calls[0]?.[1] as RequestInit).body as string);
    expect(requestBody.response_format.type).toBe("json_schema");
    expect(requestBody.response_format.json_schema.name).toBe("my_schema");
  });

  describe("healthCheck", () => {
    it("reports unhealthy without a network call when no API key is configured", async () => {
      const fetchSpy = vi.fn();
      vi.stubGlobal("fetch", fetchSpy);
      const provider = new OpenAICompatibleProvider({ id: "openai", apiKey: "", baseUrl: "https://api.openai.com/v1" });

      const status = await provider.healthCheck();

      expect(status).toEqual({ healthy: false, reason: "no API key configured" });
      expect(fetchSpy).not.toHaveBeenCalled();
    });

    it("reports healthy and populates availableModels from a successful models-list probe", async () => {
      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue(jsonResponse({ data: [{ id: "gpt-4o-mini" }, { id: "gpt-4o" }] })),
      );
      const provider = new OpenAICompatibleProvider({ id: "openai", apiKey: "sk-test", baseUrl: "https://api.openai.com/v1" });

      const status = await provider.healthCheck();

      expect(status.healthy).toBe(true);
      expect(status.availableModels).toEqual(["gpt-4o-mini", "gpt-4o"]);
    });

    it("reports unhealthy with a reason on a non-2xx models-list response", async () => {
      vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("unauthorized", { status: 401 })));
      const provider = new OpenAICompatibleProvider({ id: "openai", apiKey: "sk-bad", baseUrl: "https://api.openai.com/v1" });

      const status = await provider.healthCheck();

      expect(status.healthy).toBe(false);
      expect(status.reason).toMatch(/HTTP 401/);
      expect(status.availableModels).toBeUndefined();
    });

    it("reports healthy but leaves availableModels undefined when the response body doesn't parse as a model list", async () => {
      vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse({ unexpected: "shape" })));
      const provider = new OpenAICompatibleProvider({ id: "openai", apiKey: "sk-test", baseUrl: "https://api.openai.com/v1" });

      const status = await provider.healthCheck();

      expect(status.healthy).toBe(true);
      expect(status.availableModels).toBeUndefined();
    });
  });
});
