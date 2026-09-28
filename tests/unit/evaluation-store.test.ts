import { existsSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { appendJsonlRecord, ContentLog, EvaluationStore, type InferenceRecord } from "../../src/telemetry/evaluation-store.js";

function record(overrides: Partial<InferenceRecord> = {}): InferenceRecord {
  return {
    requestId: "req-1",
    task: "talentsquad.extract_job",
    provider: "mock",
    model: "mock-structured-v1",
    promptVersion: "talentsquad.extract-job.v1",
    latencyMs: 42,
    success: true,
    schemaValid: true,
    timestamp: new Date().toISOString(),
    attemptIndex: 0,
    ...overrides,
  };
}

describe("EvaluationStore", () => {
  it("records and lists operational metadata without requiring provider content", () => {
    const store = new EvaluationStore();
    store.record(record());
    expect(store.list()).toHaveLength(1);
  });

  it("filters by task/provider/model", () => {
    const store = new EvaluationStore();
    store.record(record({ provider: "openai" }));
    store.record(record({ provider: "anthropic" }));
    expect(store.list({ provider: "openai" })).toHaveLength(1);
    expect(store.list({ provider: "does-not-exist" })).toHaveLength(0);
  });
});

describe("ContentLog", () => {
  it("never stores anything when disabled", () => {
    const log = new ContentLog(false);
    log.record("req-1", { rawText: "resume contents" }, { title: "x" });
    expect(log.get("req-1")).toBeUndefined();
    expect(log.isEnabled()).toBe(false);
  });

  it("stores full content only when explicitly enabled", () => {
    const log = new ContentLog(true);
    log.record("req-1", { rawText: "resume contents" }, { title: "x" });
    expect(log.get("req-1")).toEqual({ input: { rawText: "resume contents" }, output: { title: "x" } });
  });
});

describe("appendJsonlRecord", () => {
  const path = join(tmpdir(), `fair-exchange-gateway-test-${Date.now()}.jsonl`);

  afterEach(() => {
    if (existsSync(path)) rmSync(path);
  });

  it("appends one JSON object per line, creating parent directories as needed", () => {
    appendJsonlRecord(path, { a: 1 });
    appendJsonlRecord(path, { a: 2 });
    const lines = readFileSync(path, "utf8").trim().split("\n");
    expect(lines).toHaveLength(2);
    expect(JSON.parse(lines[0] ?? "")).toEqual({ a: 1 });
    expect(JSON.parse(lines[1] ?? "")).toEqual({ a: 2 });
  });
});
