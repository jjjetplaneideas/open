import type { NextFunction, Request, Response } from "express";
import { toClientSafeError } from "../inference/errors.js";
import type { Logger } from "../telemetry/logger.js";

/**
 * Central error handler. Every error - ours or a provider's - passes through
 * here before reaching a client. Only a code + message ever leave the
 * process; stack traces, provider error bodies, and raw exception objects
 * are logged server-side only. This is what "sanitize provider errors
 * before returning them to clients" means architecturally.
 */
export function createErrorHandler(logger: Logger) {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  return (error: unknown, req: Request, res: Response, _next: NextFunction): void => {
    const safe = toClientSafeError(error);
    logger.error("request failed", {
      path: req.path,
      code: safe.code,
      httpStatus: safe.httpStatus,
      internalMessage: error instanceof Error ? error.message : String(error),
    });
    res.status(safe.httpStatus).json({ error: { code: safe.code, message: safe.message } });
  };
}
