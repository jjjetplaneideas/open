import { describe, expect, it } from "vitest";
import type { AIProvider, HealthStatus } from "../../src/providers/types.js";
import { classifyModelAvailability, evaluateTaskReadiness } from "../../src/router/router.js";
import { getTask } from "../../src/tasks/registry.js";
import { FakeProvider } from "./helpers/fake-provider.js";

describe("classifyModelAvailability", () => {
  it("is 'verified' when a live-probed model list includes the routed model", () => {
    const health: HealthStatus = { healthy: true, availableModels: ["gpt-4o-mini", "gpt-4o"] };
    expect(classifyModelAvailability("gpt-4o-mini", health)).toBe("verified");
  });

  it("is 'missing' when a live-probed model list does NOT include the routed model (retired/renamed)", () => {
    const health: HealthStatus = { healthy: true, availableModels: ["gpt-4o"] };
    expect(classifyModelAvailability("claude-3-5-haiku-20241022", health)).toBe("missing");
  });

  it("is 'unverifiable' when no health data exists at all", () => {
    expect(classifyModelAvailability("gpt-4o-mini", undefined)).toBe("unverifiable");
  });

  it("is 'unverifiable' when the probe ran but returned no parseable model list (never treated as missing)", () => {
    const health: HealthStatus = { healthy: true }; // availableModels absent - probe succeeded but body didn't parse
    expect(classifyModelAvailability("gpt-4o-mini", health)).toBe("unverifiable");
  });

  it("is 'unverifiable' when the probe failed outright (not configured, timeout, non-2xx)", () => {
    const health: HealthStatus = { healthy: false, reason: "connectivity check timed out after 5000ms" };
    expect(classifyModelAvailability("gpt-4o-mini", health)).toBe("unverifiable");
  });
});

describe("evaluateTaskReadiness", () => {
  const task = getTask("talentsquad.extract_job"); // primary: nvidia-nim, fallback: openai, anthropic

  function providerMap(): Map<string, AIProvider> {
    return new Map<string, AIProvider>([
      ["nvidia-nim", new FakeProvider("nvidia-nim", { responses: [] }, true)],
      ["openai", new FakeProvider("openai", { responses: [] }, true)],
      ["anthropic", new FakeProvider("anthropic", { responses: [] }, true)],
    ]);
  }

  it("is routable when every candidate's model is verified present", () => {
    const providers = providerMap();
    const health = new Map<string, HealthStatus>([
      ["nvidia-nim", { healthy: true, availableModels: ["meta/llama-3.1-70b-instruct"] }],
      ["openai", { healthy: true, availableModels: ["gpt-4o-mini"] }],
      ["anthropic", { healthy: true, availableModels: ["claude-haiku-4-5"] }],
    ]);

    const readiness = evaluateTaskReadiness(task, providers, health);

    expect(readiness.routable).toBe(true);
    expect(readiness.candidates.every((c) => c.modelStatus === "verified")).toBe(true);
  });

  it("a configured provider whose routed model is confirmed missing/retired is NOT considered route-ready by itself", () => {
    const providers = new Map<string, AIProvider>([
      ["anthropic", new FakeProvider("anthropic", { responses: [] }, true)],
    ]);
    // Anthropic is reachable and configured, but its live model list no longer
    // contains the routed model (e.g. it was retired) - this is the exact
    // regression the review asked for.
    const health = new Map<string, HealthStatus>([
      ["anthropic", { healthy: true, availableModels: ["claude-opus-5", "claude-sonnet-5"] }], // no claude-haiku-4-5
    ]);
    const anthropicOnly = { ...task, allowedProviders: ["anthropic"] };

    const readiness = evaluateTaskReadiness(anthropicOnly, providers, health);

    expect(readiness.routable).toBe(false);
    expect(readiness.candidates).toHaveLength(1);
    expect(readiness.candidates[0]?.modelStatus).toBe("missing");
  });

  it("falls back to a verified candidate when the primary's model is missing", () => {
    const providers = providerMap();
    const health = new Map<string, HealthStatus>([
      ["nvidia-nim", { healthy: true, availableModels: ["some-other-model"] }], // primary's model retired
      ["openai", { healthy: true, availableModels: ["gpt-4o-mini"] }], // fallback still fine
      ["anthropic", { healthy: true, availableModels: ["claude-haiku-4-5"] }],
    ]);

    const readiness = evaluateTaskReadiness(task, providers, health);

    expect(readiness.routable).toBe(true);
    const primary = readiness.candidates.find((c) => c.provider === "nvidia-nim");
    expect(primary?.modelStatus).toBe("missing");
    const fallback = readiness.candidates.find((c) => c.provider === "openai");
    expect(fallback?.modelStatus).toBe("verified");
  });

  it("does NOT flap to not-routable when the live probe simply failed/timed out (transient latency)", () => {
    const providers = new Map<string, AIProvider>([
      ["openai", new FakeProvider("openai", { responses: [] }, true)],
    ]);
    const health = new Map<string, HealthStatus>([
      ["openai", { healthy: false, reason: "connectivity check timed out after 5000ms" }],
    ]);
    const openaiOnly = { ...task, allowedProviders: ["openai"] };

    const readiness = evaluateTaskReadiness(openaiOnly, providers, health);

    expect(readiness.routable).toBe(true);
    expect(readiness.candidates[0]?.modelStatus).toBe("unverifiable");
  });

  it("is not routable when the task has no configured real candidates at all, regardless of health data", () => {
    const readiness = evaluateTaskReadiness(task, new Map(), new Map());
    expect(readiness.routable).toBe(false);
    expect(readiness.candidates).toEqual([]);
  });

  it("never surfaces mock as a candidate, even if mock is in the provider map", () => {
    const providers = providerMap();
    providers.set("mock", new FakeProvider("mock", { responses: [] }, true));
    const readiness = evaluateTaskReadiness(task, providers, new Map());
    expect(readiness.candidates.some((c) => c.provider === "mock")).toBe(false);
    expect(readiness.configuredProviders).not.toContain("mock");
  });
});
