import type { NextFunction, Request, Response } from "express";
import type { GatewayConfig } from "../config/env.js";
import { UnauthorizedError } from "../inference/errors.js";
import type { Logger } from "../telemetry/logger.js";

/**
 * Simple shared-API-key auth: applications send `x-api-key`, checked against
 * GATEWAY_API_KEYS. This is intentionally minimal for V1 - see
 * docs/architecture.md#authentication for the production evolution path
 * (per-application keys with scoping, mTLS between internal services, etc).
 * Mobile apps must never hold one of these keys; they call their own
 * backend, which calls this gateway.
 */
export function createAuthMiddleware(config: GatewayConfig, logger: Logger) {
  if (config.GATEWAY_API_KEYS.length === 0) {
    logger.warn("GATEWAY_API_KEYS is empty - the gateway is running UNAUTHENTICATED. This is only acceptable in local development.");
  }

  return (req: Request, _res: Response, next: NextFunction): void => {
    if (config.GATEWAY_API_KEYS.length === 0) {
      next();
      return;
    }

    const provided = req.header("x-api-key");
    if (!provided || !config.GATEWAY_API_KEYS.includes(provided)) {
      next(new UnauthorizedError());
      return;
    }

    next();
  };
}
