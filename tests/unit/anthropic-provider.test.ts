import { afterEach, describe, expect, it, vi } from "vitest";
import { AnthropicProvider } from "../../src/providers/anthropic/anthropic-provider.js";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

function provider(apiKey = "sk-ant-test") {
  return new AnthropicProvider({ apiKey, baseUrl: "https://api.anthropic.com/v1", version: "2023-06-01" });
}

describe("AnthropicProvider.healthCheck", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("reports unhealthy without a network call when no API key is configured", async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);

    const status = await provider("").healthCheck();

    expect(status).toEqual({ healthy: false, reason: "no API key configured" });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("reports healthy and populates availableModels from a successful models-list probe, sending the correct auth headers", async () => {
    const fetchSpy = vi
      .fn()
      .mockResolvedValue(jsonResponse({ data: [{ id: "claude-opus-5" }, { id: "claude-haiku-4-5" }] }));
    vi.stubGlobal("fetch", fetchSpy);

    const status = await provider().healthCheck();

    expect(status.healthy).toBe(true);
    expect(status.availableModels).toEqual(["claude-opus-5", "claude-haiku-4-5"]);
    const [url, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://api.anthropic.com/v1/models");
    expect((init.headers as Record<string, string>)["x-api-key"]).toBe("sk-ant-test");
    expect((init.headers as Record<string, string>)["anthropic-version"]).toBe("2023-06-01");
  });

  it("flags a retired/renamed model as missing once a real model list is available (regression for the route-config fix)", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(jsonResponse({ data: [{ id: "claude-opus-5" }, { id: "claude-haiku-4-5" }] })),
    );

    const status = await provider().healthCheck();

    expect(status.availableModels).toBeDefined();
    expect(status.availableModels).not.toContain("claude-3-5-haiku-20241022");
    expect(status.availableModels).toContain("claude-haiku-4-5");
  });

  it("reports unhealthy with a reason on a non-2xx response and does not populate availableModels", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("forbidden", { status: 403 })));

    const status = await provider().healthCheck();

    expect(status.healthy).toBe(false);
    expect(status.reason).toMatch(/HTTP 403/);
    expect(status.availableModels).toBeUndefined();
  });

  it("reports unhealthy on a network failure without throwing", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation(() => Promise.reject(new Error("ECONNRESET"))),
    );

    const status = await provider().healthCheck();

    expect(status.healthy).toBe(false);
    expect(status.reason).toMatch(/connectivity check failed/);
  });
});
