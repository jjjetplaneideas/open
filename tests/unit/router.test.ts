import { describe, expect, it } from "vitest";
import { RouteNotConfiguredError } from "../../src/inference/errors.js";
import { MockProvider } from "../../src/providers/mock/mock-provider.js";
import { resolveCandidates } from "../../src/router/router.js";
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
      ["mock", new MockProvider()],
    ]);

    const candidates = resolveCandidates(task, providers);

    expect(candidates.map((c) => c.provider.id)).toEqual(["openai", "anthropic", "mock"]);
  });

  it("respects a task's allowedProviders restriction", () => {
    const task = getTask("talentsquad.extract_job");
    const restricted: AnyTaskDefinition = { ...task, allowedProviders: ["mock"] };
    const providers = new Map<string, AIProvider>([
      ["nvidia-nim", new FakeProvider("nvidia-nim", { responses: [] }, true)],
      ["openai", new FakeProvider("openai", { responses: [] }, true)],
      ["mock", new MockProvider()],
    ]);

    const candidates = resolveCandidates(restricted, providers);

    expect(candidates.map((c) => c.provider.id)).toEqual(["mock"]);
  });

  it("throws when a registered task has no routing table entry", () => {
    const task = getTask("talentsquad.extract_job");
    const orphanTask: AnyTaskDefinition = { ...task, id: "no.such.route" };
    const providers = new Map([["mock", new MockProvider()]]);

    expect(() => resolveCandidates(orphanTask, providers)).toThrow(RouteNotConfiguredError);
  });
});
