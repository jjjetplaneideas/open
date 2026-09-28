import type { NextFunction, Request, Response } from "express";
import { RateLimitExceededError } from "../inference/errors.js";

interface Window {
  count: number;
  resetAt: number;
}

/**
 * Minimal fixed-window in-memory rate limiter, keyed by API key (falling
 * back to remote address when unauthenticated in local dev). V1 does not
 * need a distributed limiter - see docs/production-limitations.md for what
 * changes if the gateway is ever run with multiple replicas.
 */
export function createRateLimitMiddleware(windowMs: number, maxRequests: number) {
  const windows = new Map<string, Window>();

  return (req: Request, _res: Response, next: NextFunction): void => {
    const key = req.header("x-api-key") ?? req.ip ?? "unknown";
    const now = Date.now();
    const existing = windows.get(key);

    if (!existing || existing.resetAt <= now) {
      windows.set(key, { count: 1, resetAt: now + windowMs });
      next();
      return;
    }

    if (existing.count >= maxRequests) {
      next(new RateLimitExceededError());
      return;
    }

    existing.count += 1;
    next();
  };
}
