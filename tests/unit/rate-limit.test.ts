import type { Request, Response } from "express";
import { describe, expect, it, vi } from "vitest";
import { RateLimitExceededError } from "../../src/inference/errors.js";
import { createRateLimitMiddleware } from "../../src/security/rate-limit.js";

function fakeReq(key: string): Request {
  return { header: () => key, ip: key } as unknown as Request;
}

describe("rate limit middleware", () => {
  it("allows requests under the configured limit", () => {
    const middleware = createRateLimitMiddleware(60_000, 3);
    const next = vi.fn();
    for (let i = 0; i < 3; i++) middleware(fakeReq("client-a"), {} as Response, next);
    expect(next).toHaveBeenCalledTimes(3);
    expect(next).not.toHaveBeenCalledWith(expect.any(RateLimitExceededError));
  });

  it("blocks a client that exceeds the limit within the window", () => {
    const middleware = createRateLimitMiddleware(60_000, 2);
    const next = vi.fn();
    middleware(fakeReq("client-b"), {} as Response, next);
    middleware(fakeReq("client-b"), {} as Response, next);
    middleware(fakeReq("client-b"), {} as Response, next);
    expect(next).toHaveBeenLastCalledWith(expect.any(RateLimitExceededError));
  });

  it("tracks separate clients independently", () => {
    const middleware = createRateLimitMiddleware(60_000, 1);
    const next = vi.fn();
    middleware(fakeReq("client-c"), {} as Response, next);
    middleware(fakeReq("client-d"), {} as Response, next);
    expect(next).toHaveBeenCalledTimes(2);
    expect(next).not.toHaveBeenCalledWith(expect.any(RateLimitExceededError));
  });
});
