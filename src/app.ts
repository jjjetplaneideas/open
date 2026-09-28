import express, { type Express, type NextFunction, type Request, type Response } from "express";
import { InvalidInputError, RequestTooLargeError } from "./inference/errors.js";
import { createInferenceRouter } from "./api/routes/inference.js";
import { createHealthRouter } from "./api/routes/health.js";
import type { GatewayConfig } from "./config/env.js";
import { InferenceService } from "./inference/inference-service.js";
import { buildProviderRegistry } from "./providers/registry.js";
import { createAuthMiddleware } from "./security/auth.js";
import { createRateLimitMiddleware } from "./security/rate-limit.js";
import { createErrorHandler } from "./security/sanitize-error.js";
import { ContentLog, EvaluationStore } from "./telemetry/evaluation-store.js";
import { Logger } from "./telemetry/logger.js";
import type { AIProvider } from "./providers/types.js";

export interface AppContext {
  app: Express;
  inferenceService: InferenceService;
  evaluationStore: EvaluationStore;
  contentLog: ContentLog;
  providers: Map<string, AIProvider>;
  logger: Logger;
}

/**
 * Builds the Express app and all its wiring. Split out from index.ts so
 * tests can construct the app (via supertest) without binding a real port,
 * and so the benchmark CLI can reuse the same provider/inference wiring
 * without an HTTP layer at all.
 */
export function createApp(config: GatewayConfig): AppContext {
  const logger = new Logger(config.LOG_LEVEL);
  const providers = buildProviderRegistry(config);
  const evaluationStore = new EvaluationStore();
  const contentLog = new ContentLog(config.FAIR_EXCHANGE_LOG_FULL_CONTENT);
  const inferenceService = new InferenceService(providers, evaluationStore, contentLog, logger);

  const app = express();
  app.disable("x-powered-by");
  app.use(express.json({ limit: config.REQUEST_BODY_LIMIT_BYTES }));
  app.use(normalizeBodyParserErrors);

  app.use(createHealthRouter(providers));

  app.use(createAuthMiddleware(config, logger));
  app.use(createRateLimitMiddleware(config.RATE_LIMIT_WINDOW_MS, config.RATE_LIMIT_MAX_REQUESTS));
  app.use(createInferenceRouter(inferenceService, config.GATEWAY_EXPOSE_PROVIDER_INFO));

  app.use(createErrorHandler(logger));

  return { app, inferenceService, evaluationStore, contentLog, providers, logger };
}

/** express.json() throws a body-parser SyntaxError (status 400/413) on malformed/oversized bodies; translate it into our typed error hierarchy instead of letting it fall through as a 500. */
function normalizeBodyParserErrors(error: unknown, _req: Request, _res: Response, next: NextFunction): void {
  if (error && typeof error === "object" && "type" in error) {
    const bodyError = error as { type?: string; status?: number; message?: string };
    if (bodyError.type === "entity.too.large" || bodyError.status === 413) {
      next(new RequestTooLargeError());
      return;
    }
    if (bodyError.type === "entity.parse.failed" || error instanceof SyntaxError) {
      next(new InvalidInputError(`Malformed JSON body: ${bodyError.message ?? "parse error"}`));
      return;
    }
  }
  next(error);
}
