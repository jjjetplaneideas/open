import type { Request, Response } from "express";
import { describe, expect, it, vi } from "vitest";
import type { GatewayConfig } from "../../src/config/env.js";
import { UnauthorizedError } from "../../src/inference/errors.js";
import { createAuthMiddleware } from "../../src/security/auth.js";
import { Logger } from "../../src/telemetry/logger.js";

function fakeConfig(apiKeys: string[]): GatewayConfig {
  return { GATEWAY_API_KEYS: apiKeys } as GatewayConfig;
}

function fakeReq(headerValue?: string): Request {
  return { header: () => headerValue } as unknown as Request;
}

describe("auth middleware", () => {
  it("passes every request through unauthenticated when no keys are configured (local dev)", () => {
    const middleware = createAuthMiddleware(fakeConfig([]), new Logger("error"));
    const next = vi.fn();
    middleware(fakeReq(undefined), {} as Response, next);
    expect(next).toHaveBeenCalledWith();
  });

  it("accepts a request carrying a configured key", () => {
    const middleware = createAuthMiddleware(fakeConfig(["secret-1"]), new Logger("error"));
    const next = vi.fn();
    middleware(fakeReq("secret-1"), {} as Response, next);
    expect(next).toHaveBeenCalledWith();
  });

  it("rejects a request with a missing key once keys are configured", () => {
    const middleware = createAuthMiddleware(fakeConfig(["secret-1"]), new Logger("error"));
    const next = vi.fn();
    middleware(fakeReq(undefined), {} as Response, next);
    expect(next).toHaveBeenCalledWith(expect.any(UnauthorizedError));
  });

  it("rejects a request with a wrong key", () => {
    const middleware = createAuthMiddleware(fakeConfig(["secret-1"]), new Logger("error"));
    const next = vi.fn();
    middleware(fakeReq("wrong-key"), {} as Response, next);
    expect(next).toHaveBeenCalledWith(expect.any(UnauthorizedError));
  });
});
