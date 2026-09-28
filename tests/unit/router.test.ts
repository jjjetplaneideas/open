import { describe, expect, it } from "vitest";
import { RouteNotConfiguredError } from "../../src/inference/errors.js";
import { MockProvider } from "../../src/providers/mock/mock-provider.js";
import { isTaskRoutableWithRealProviders, resolveCandidates } from "../../src/router/router.js";
import type { AIProvider } from "../../src/providers/types.js";
import { getTask } from "../../src/tasks/registry.js";
import type { AnyTaskDefinition } from "../../src/tasks/types.js";
import { FakeProvider } from "./helpers/fake-provider.js";

describe("router.resolveCandidates", () => {
  it("orders candidates primary-then-fallback and skips unconfigured providers", () => {
    const task = getTask("talentsquad.extract_job");
    const providers = new Map<string, AIProvider>([
      ["nvidia-nim", new FakeProvider("nvidia-nim", { responses: [] }, false)], // not configured
      ["openai", new FakeProvider("openai", { responses: [] }, true)],
      ["anthropic", new FakeProvider("anthropic", { responses: [] }, true)],
    ]);

    const candidates = resolveCandidates(task, providers);

    expect(candidates.map((c) => c.provider.id)).toEqual(["openai", "anthropic"]);
  });

  it("respects a task's allowedProviders restriction", () => {
    const task = getTask("talentsquad.extract_job");
    const restricted: AnyTaskDefinition = { ...task, allowedProviders: ["anthropic"] };
    const providers = new Map<string, AIProvider>([
      ["nvidia-nim", new FakeProvider("nvidia-nim", { responses: [] }, true)],
      ["openai", new FakeProvider("openai", { responses: [] }, true)],
      ["anthropic", new FakeProvider("anthropic", { responses: [] }, true)],
    ]);

    const candidates = resolveCandidates(restricted, providers);

    expect(candidates.map((c) => c.provider.id)).toEqual(["anthropic"]);
  });

  it("throws when a registered task has no routing table entry", () => {
    const task = getTask("talentsquad.extract_job");
    const orphanTask: AnyTaskDefinition = { ...task, id: "no.such.route" };
    const providers = new Map([["mock", new MockProvider()]]);

    expect(() => resolveCandidates(orphanTask, providers)).toThrow(RouteNotConfiguredError);
  });

  describe("mock is never an automatic fallback", () => {
    it("never includes mock by default, even when mock is present and configured in the registry", () => {
      const task = getTask("talentsquad.extract_job");
      const providers = new Map<string, AIProvider>([["mock", new MockProvider()]]);

      const candidates = resolveCandidates(task, providers);

      expect(candidates).toEqual([]);
    });

    it("does not append mock when allowMockFallback is explicitly false", () => {
      const task = getTask("talentsquad.extract_job");
      const providers = new Map<string, AIProvider>([["mock", new MockProvider()]]);

      const candidates = resolveCandidates(task, providers, { allowMockFallback: false });

      expect(candidates).toEqual([]);
    });

    it("appends mock as the final candidate only when allowMockFallback is explicitly true", () => {
      const task = getTask("talentsquad.extract_job");
      const openai = new FakeProvider("openai", { responses: [] }, true);
      const providers = new Map<string, AIProvider>([
        ["openai", openai],
        ["mock", new MockProvider()],
      ]);

      const candidates = resolveCandidates(task, providers, { allowMockFallback: true });

      expect(candidates.map((c) => c.provider.id)).toEqual(["openai", "mock"]);
    });

    it("does not append mock when allowMockFallback is true but mock isn't in the registry at all", () => {
      const task = getTask("talentsquad.extract_job");
      const providers = new Map<string, AIProvider>();

      const candidates = resolveCandidates(task, providers, { allowMockFallback: true });

      expect(candidates).toEqual([]);
    });

    it("filters out a hypothetical mock entry in the route table itself (defense in depth)", () => {
      // Even if route-config.ts ever grew a "mock" entry by mistake, the walk
      // still must not surface it unless allowMockFallback is explicitly true.
      const task = getTask("talentsquad.extract_job");
      const tamperedTask: AnyTaskDefinition = { ...task, allowedProviders: undefined };
      const providers = new Map<string, AIProvider>([["mock", new MockProvider()]]);

      expect(resolveCandidates(tamperedTask, providers).some((c) => c.provider.id === "mock")).toBe(false);
    });
  });
});

describe("router.isTaskRoutableWithRealProviders", () => {
  it("is not routable when no real provider is configured", () => {
    const task = getTask("talentsquad.extract_job");
    const { routable, configuredProviders } = isTaskRoutableWithRealProviders(task, new Map());
    expect(routable).toBe(false);
    expect(configuredProviders).toEqual([]);
  });

  it("is routable once at least one real provider is configured", () => {
    const task = getTask("talentsquad.extract_job");
    const providers = new Map<string, AIProvider>([["openai", new FakeProvider("openai", { responses: [] }, true)]]);
    const { routable, configuredProviders } = isTaskRoutableWithRealProviders(task, providers);
    expect(routable).toBe(true);
    expect(configuredProviders).toEqual(["openai"]);
  });

  it("never counts mock, even if mock is registered and configured", () => {
    const task = getTask("talentsquad.extract_job");
    const providers = new Map<string, AIProvider>([["mock", new MockProvider()]]);
    const { routable, configuredProviders } = isTaskRoutableWithRealProviders(task, providers);
    expect(routable).toBe(false);
    expect(configuredProviders).toEqual([]);
  });
});
