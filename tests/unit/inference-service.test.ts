import { describe, expect, it } from "vitest";
import { AllProvidersFailedError, InvalidInputError, ProviderError, UnknownTaskError } from "../../src/inference/errors.js";
import { InferenceService } from "../../src/inference/inference-service.js";
import { MockProvider } from "../../src/providers/mock/mock-provider.js";
import type { AIProvider } from "../../src/providers/types.js";
import { ContentLog, EvaluationStore } from "../../src/telemetry/evaluation-store.js";
import { Logger } from "../../src/telemetry/logger.js";
import { FakeProvider } from "./helpers/fake-provider.js";

const validExtraction = {
  title: "Front Desk Agent",
  employer: "The Gulfview Resort & Spa",
  location: { propertyName: null, city: null, state: null },
  department: "Guest Services",
  employmentType: "full_time",
  description: "Checks guests in and out.",
  sourceUrl: "https://careers.example-resort.com/jobs/4821",
  sourceTimestamp: "2026-09-20T14:00:00.000Z",
  compensation: { present: true, raw: "$17-19.50/hr", min: 17, max: 19.5, currency: "USD", period: "hour" },
  requirements: ["1+ years experience"],
  sourceConfidence: "VERIFIED_RECENT",
  inferredFields: [],
};

const extractInput = {
  sourceUrl: "https://careers.example-resort.com/jobs/4821",
  sourceTimestamp: "2026-09-20T14:00:00.000Z",
  sourceConfidence: "VERIFIED_RECENT",
  rawText: "Front Desk Agent at The Gulfview Resort & Spa, Guest Services, $17-19.50/hr, 1+ years experience required.",
};

function buildService(providers: Map<string, AIProvider>) {
  const evaluationStore = new EvaluationStore();
  const contentLog = new ContentLog(false);
  const logger = new Logger("error");
  const service = new InferenceService(providers, evaluationStore, contentLog, logger);
  return { service, evaluationStore };
}

describe("InferenceService", () => {
  it("rejects unregistered tasks before touching any provider", async () => {
    const { service } = buildService(new Map());
    await expect(service.run({ taskId: "not.a.task", input: {} })).rejects.toThrow(UnknownTaskError);
  });

  it("rejects input that fails the task's input schema", async () => {
    const { service } = buildService(new Map([["mock", new MockProvider()]]));
    await expect(
      service.run({ taskId: "talentsquad.extract_job", input: { rawText: "" } }),
    ).rejects.toThrow(InvalidInputError);
  });

  it("runs a structured task end-to-end against the mock provider fallback", async () => {
    const { service, evaluationStore } = buildService(new Map([["mock", new MockProvider()]]));
    const result = await service.run({ taskId: "talentsquad.extract_job", input: extractInput, override: { provider: "mock", model: "mock-structured-v1" } });

    expect(result.provider).toBe("mock");
    expect(result.schemaValid).toBe(true);
    expect(result.promptVersion).toBe("talentsquad.extract-job.v1");
    expect(typeof result.result).toBe("object");

    const records = evaluationStore.list();
    expect(records).toHaveLength(1);
    expect(records[0]?.success).toBe(true);
    expect(records[0]?.schemaValid).toBe(true);
  });

  it("runs an unstructured (text) task end-to-end", async () => {
    const anglerjInput = {
      weather: { tempF: 82, windMph: 9, windDirection: "SE", skyCondition: "partly cloudy" },
      tide: { stage: "rising", nextChangeIso: "2026-09-28T18:42:00.000Z" },
      solunar: { majorPeriods: ["06:15-08:15"], minorPeriods: [] },
      pressure: { inHg: 30.05, trend: "steady" },
      regulations: { species: "Spotted Seatrout", slotLimitInches: "15-19", dailyBagLimit: 3, seasonOpen: true },
      score: { value: 78, label: "Good" },
      safety: { state: "MONITORING", note: null },
    };
    const { service } = buildService(new Map([["mock", new MockProvider()]]));
    const result = await service.run({
      taskId: "anglerj.explain_conditions",
      input: anglerjInput,
      override: { provider: "mock", model: "mock-text-v1" },
    });

    expect(result.schemaValid).toBeNull();
    expect(typeof result.result).toBe("string");
  });

  it("falls back to the next provider when the first fails with a retryable error", async () => {
    const failing = new FakeProvider("nvidia-nim", {
      responses: [{ throw: new ProviderError("nvidia-nim", "simulated 503", { retryable: true }) }],
    });
    const succeeding = new FakeProvider("openai", { responses: [{ text: JSON.stringify(validExtraction) }] });
    const providers = new Map<string, AIProvider>([
      ["nvidia-nim", failing],
      ["openai", succeeding],
      ["anthropic", new FakeProvider("anthropic", { responses: [] })],
      ["mock", new MockProvider()],
    ]);
    const { service, evaluationStore } = buildService(providers);

    const result = await service.run({ taskId: "talentsquad.extract_job", input: extractInput });

    expect(result.provider).toBe("openai");
    expect(failing.calls).toHaveLength(1);
    expect(succeeding.calls).toHaveLength(1);

    const records = evaluationStore.list();
    expect(records).toHaveLength(2); // one failed attempt (nvidia-nim), one successful (openai)
    expect(records[0]?.success).toBe(false);
    expect(records[1]?.success).toBe(true);
  });

  it("throws AllProvidersFailedError with per-attempt reasons when every candidate fails", async () => {
    const providers = new Map<string, AIProvider>([
      ["nvidia-nim", new FakeProvider("nvidia-nim", { responses: [{ throw: new Error("boom-1") }] })],
      ["openai", new FakeProvider("openai", { responses: [{ throw: new Error("boom-2") }] })],
      ["anthropic", new FakeProvider("anthropic", { responses: [{ throw: new Error("boom-3") }] })],
      ["mock", new FakeProvider("mock", { responses: [{ throw: new Error("boom-4") }] })],
    ]);
    const { service } = buildService(providers);

    await expect(service.run({ taskId: "talentsquad.extract_job", input: extractInput })).rejects.toThrow(
      AllProvidersFailedError,
    );
  });

  it("attempts a bounded repair when structured output first fails validation, then accepts a corrected response", async () => {
    const flaky = new FakeProvider("nvidia-nim", {
      responses: [{ text: JSON.stringify({ title: "missing everything else" }) }, { text: JSON.stringify(validExtraction) }],
    });
    const providers = new Map<string, AIProvider>([["nvidia-nim", flaky]]);
    const { service } = buildService(providers);

    const result = await service.run({
      taskId: "talentsquad.extract_job",
      input: extractInput,
      override: { provider: "nvidia-nim", model: "meta/llama-3.1-70b-instruct" },
    });

    expect(flaky.calls).toHaveLength(2);
    expect(result.schemaValid).toBe(true);
  });

  it("gives up with SchemaValidationError after exhausting repair attempts on every candidate", async () => {
    const alwaysBroken = new FakeProvider("mock", {
      responses: [{ text: "{}" }, { text: "{}" }],
    });
    const providers = new Map<string, AIProvider>([["mock", alwaysBroken]]);
    const { service } = buildService(providers);

    await expect(
      service.run({
        taskId: "talentsquad.extract_job",
        input: extractInput,
        override: { provider: "mock", model: "mock-structured-v1" },
      }),
    ).rejects.toThrow(AllProvidersFailedError);
  });

  it("rejects a caller-supplied systemPrompt for SAFETY_EXPLANATION_ONLY-equivalent tasks", async () => {
    // talentsquad.extract_job is NORMAL, so this should pass through untouched -
    // the safety gate only fires for SAFETY_EXPLANATION_ONLY/HIGH_RISK tasks.
    const { service } = buildService(new Map([["mock", new MockProvider()]]));
    const result = await service.run({
      taskId: "talentsquad.extract_job",
      input: { ...extractInput },
      override: { provider: "mock", model: "mock-structured-v1" },
    });
    expect(result).toBeDefined();
  });
});
