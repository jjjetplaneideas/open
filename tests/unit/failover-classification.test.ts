import { describe, expect, it } from "vitest";
import {
  InternalConfigurationError,
  InvalidInputError,
  ProviderError,
  ProviderNotConfiguredError,
  ProviderTimeoutError,
  SchemaValidationError,
  isFailoverEligible,
} from "../../src/inference/errors.js";
import { InferenceService } from "../../src/inference/inference-service.js";
import type { AIProvider } from "../../src/providers/types.js";
import { ContentLog, EvaluationStore } from "../../src/telemetry/evaluation-store.js";
import { Logger } from "../../src/telemetry/logger.js";
import { FakeProvider } from "./helpers/fake-provider.js";

describe("isFailoverEligible", () => {
  it("treats ProviderError (and its subclasses) as failover-eligible", () => {
    expect(isFailoverEligible(new ProviderError("openai", "boom", { retryable: true }))).toBe(true);
    expect(isFailoverEligible(new ProviderError("openai", "boom", { retryable: false }))).toBe(true);
    expect(isFailoverEligible(new ProviderTimeoutError("openai", 1000))).toBe(true);
    expect(isFailoverEligible(new ProviderNotConfiguredError("openai"))).toBe(true);
  });

  it("treats SchemaValidationError as failover-eligible (a different candidate may still succeed)", () => {
    expect(isFailoverEligible(new SchemaValidationError("talentsquad.extract_job", ["bad"]))).toBe(true);
  });

  it("does NOT treat an internal configuration defect as failover-eligible", () => {
    expect(isFailoverEligible(new InternalConfigurationError("task misconfigured"))).toBe(false);
  });

  it("does NOT treat a client input error as failover-eligible", () => {
    expect(isFailoverEligible(new InvalidInputError("bad input"))).toBe(false);
  });

  it("does NOT treat an arbitrary/unexpected error as failover-eligible", () => {
    expect(isFailoverEligible(new TypeError("cannot read property of undefined"))).toBe(false);
    expect(isFailoverEligible(new Error("something unexpected"))).toBe(false);
    expect(isFailoverEligible("not even an Error")).toBe(false);
  });
});

describe("InferenceService - failover does not hide non-provider errors", () => {
  function buildService(providers: Map<string, AIProvider>) {
    return new InferenceService(providers, new EvaluationStore(), new ContentLog(false), new Logger("error"));
  }

  const extractInput = {
    sourceUrl: "https://careers.example-resort.com/jobs/4821",
    sourceTimestamp: "2026-09-20T14:00:00.000Z",
    sourceConfidence: "VERIFIED_RECENT",
    rawText: "Front Desk Agent at The Gulfview Resort & Spa.",
  };

  it("aborts the candidate loop immediately on an unexpected (non-provider) error, without trying the next candidate", async () => {
    const buggyFirst = new FakeProvider("nvidia-nim", {
      responses: [{ throw: new TypeError("a bug in this provider adapter, not a provider outage") }],
    });
    const wouldHaveSucceeded = new FakeProvider("openai", {
      responses: [{ text: JSON.stringify({ title: null, employer: null, location: { propertyName: null, city: null, state: null }, department: null, employmentType: "unknown", description: null, compensation: { present: false, raw: null, min: null, max: null, currency: null, period: null }, requirements: [], inferredFields: [] }) }],
    });
    const service = buildService(
      new Map<string, AIProvider>([
        ["nvidia-nim", buggyFirst],
        ["openai", wouldHaveSucceeded],
      ]),
    );

    await expect(service.run({ taskId: "talentsquad.extract_job", input: extractInput })).rejects.toThrow(TypeError);

    expect(buggyFirst.calls).toHaveLength(1);
    expect(wouldHaveSucceeded.calls).toHaveLength(0); // never attempted - failover did not mask the bug
  });

  it("still fails over past a genuine ProviderError even though a later candidate would also be checked for non-provider errors", async () => {
    const outage = new FakeProvider("nvidia-nim", {
      responses: [{ throw: new ProviderError("nvidia-nim", "503 from upstream", { retryable: true }) }],
    });
    const succeeds = new FakeProvider("openai", {
      responses: [{ text: JSON.stringify({ title: null, employer: null, location: { propertyName: null, city: null, state: null }, department: null, employmentType: "unknown", description: null, compensation: { present: false, raw: null, min: null, max: null, currency: null, period: null }, requirements: [], inferredFields: [] }) }],
    });
    const service = buildService(
      new Map<string, AIProvider>([
        ["nvidia-nim", outage],
        ["openai", succeeds],
      ]),
    );

    const result = await service.run({ taskId: "talentsquad.extract_job", input: extractInput });
    expect(result.provider).toBe("openai");
    expect(succeeds.calls).toHaveLength(1);
  });
});
