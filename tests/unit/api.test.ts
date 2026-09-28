import request from "supertest";
import { describe, expect, it } from "vitest";
import { createApp } from "../../src/app.js";
import type { GatewayConfig } from "../../src/config/env.js";

function testConfig(overrides: Partial<GatewayConfig> = {}): GatewayConfig {
  return {
    PORT: 0,
    NODE_ENV: "test",
    isProduction: false,
    LOG_LEVEL: "error",
    GATEWAY_API_KEYS: [],
    REQUEST_BODY_LIMIT_BYTES: 131_072,
    RATE_LIMIT_WINDOW_MS: 60_000,
    RATE_LIMIT_MAX_REQUESTS: 1000,
    PROVIDER_TIMEOUT_MS: 5_000,
    GATEWAY_EXPOSE_PROVIDER_INFO: true,
    FAIR_EXCHANGE_LOG_FULL_CONTENT: false,
    NVIDIA_NIM_API_KEY: "",
    NVIDIA_NIM_BASE_URL: "https://integrate.api.nvidia.com/v1",
    OPENAI_API_KEY: "",
    OPENAI_BASE_URL: "https://api.openai.com/v1",
    ANTHROPIC_API_KEY: "",
    ANTHROPIC_BASE_URL: "https://api.anthropic.com/v1",
    ANTHROPIC_VERSION: "2023-06-01",
    ...overrides,
  };
}

const validExtractInput = {
  sourceUrl: "https://careers.example-resort.com/jobs/4821",
  sourceTimestamp: "2026-09-20T14:00:00.000Z",
  sourceConfidence: "VERIFIED_RECENT",
  rawText: "Front Desk Agent at The Gulfview Resort & Spa.",
};

describe("POST /v1/inference", () => {
  it("runs a registered task end-to-end with zero configured provider credentials (falls back to mock)", async () => {
    const { app } = createApp(testConfig());
    const response = await request(app)
      .post("/v1/inference")
      .send({ task: "talentsquad.extract_job", input: validExtractInput, metadata: { application: "talent-squad" } });

    expect(response.status).toBe(200);
    expect(response.body.provider).toBe("mock");
    expect(response.body.task).toBe("talentsquad.extract_job");
    expect(response.body.schemaValid).toBe(true);
    expect(typeof response.body.requestId).toBe("string");
  });

  it("rejects an unregistered task id with 400 and no internal detail", async () => {
    const { app } = createApp(testConfig());
    const response = await request(app).post("/v1/inference").send({ task: "not.a.real.task", input: {} });

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe("UNKNOWN_TASK");
    expect(response.body.error).not.toHaveProperty("stack");
  });

  it("rejects a malformed request body", async () => {
    const { app } = createApp(testConfig());
    const response = await request(app).post("/v1/inference").send({ input: {} }); // missing `task`

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe("INVALID_INPUT");
  });

  it("hides provider/model when GATEWAY_EXPOSE_PROVIDER_INFO is false", async () => {
    const { app } = createApp(testConfig({ GATEWAY_EXPOSE_PROVIDER_INFO: false }));
    const response = await request(app)
      .post("/v1/inference")
      .send({ task: "talentsquad.extract_job", input: validExtractInput });

    expect(response.status).toBe(200);
    expect(response.body.provider).toBeUndefined();
    expect(response.body.model).toBeUndefined();
  });

  it("enforces API key auth once GATEWAY_API_KEYS is configured", async () => {
    const { app } = createApp(testConfig({ GATEWAY_API_KEYS: ["secret-key"] }));

    const unauthorized = await request(app)
      .post("/v1/inference")
      .send({ task: "talentsquad.extract_job", input: validExtractInput });
    expect(unauthorized.status).toBe(401);

    const authorized = await request(app)
      .post("/v1/inference")
      .set("x-api-key", "secret-key")
      .send({ task: "talentsquad.extract_job", input: validExtractInput });
    expect(authorized.status).toBe(200);
  });

  it("enforces the configured rate limit", async () => {
    const { app } = createApp(testConfig({ RATE_LIMIT_MAX_REQUESTS: 1 }));
    await request(app).post("/v1/inference").send({ task: "talentsquad.extract_job", input: validExtractInput });
    const second = await request(app)
      .post("/v1/inference")
      .send({ task: "talentsquad.extract_job", input: validExtractInput });
    expect(second.status).toBe(429);
  });
});

describe("health endpoints", () => {
  it("GET /health always reports ok", async () => {
    const { app } = createApp(testConfig());
    const response = await request(app).get("/health");
    expect(response.status).toBe(200);
    expect(response.body.status).toBe("ok");
  });

  it("GET /ready reports registered tasks and provider configuration state", async () => {
    const { app } = createApp(testConfig());
    const response = await request(app).get("/ready");
    expect(response.status).toBe(200);
    expect(response.body.tasks).toContain("talentsquad.extract_job");
    const mockStatus = response.body.providers.find((p: { provider: string }) => p.provider === "mock");
    expect(mockStatus.configured).toBe(true);
    const openaiStatus = response.body.providers.find((p: { provider: string }) => p.provider === "openai");
    expect(openaiStatus.configured).toBe(false);
  });
});
