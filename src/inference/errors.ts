/**
 * Typed error hierarchy for the gateway. Every error carries an HTTP status
 * and a machine-readable code so the API layer never has to guess whether a
 * failure is retryable, a client mistake, or an upstream provider problem.
 */

export abstract class GatewayError extends Error {
  abstract readonly code: string;
  abstract readonly httpStatus: number;
  /** Whether the *same* attempt could reasonably be retried by the caller. */
  readonly retryable: boolean = false;

  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = this.constructor.name;
  }
}

export class UnknownTaskError extends GatewayError {
  readonly code = "UNKNOWN_TASK";
  readonly httpStatus = 400;
  constructor(taskId: string) {
    super(`Task "${taskId}" is not registered. Only registered tasks may run.`);
  }
}

export class InvalidInputError extends GatewayError {
  readonly code = "INVALID_INPUT";
  readonly httpStatus = 400;
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
  }
}

export class RequestTooLargeError extends GatewayError {
  readonly code = "REQUEST_TOO_LARGE";
  readonly httpStatus = 413;
  constructor(message = "Request payload exceeds the configured size limit.") {
    super(message);
  }
}

export class UnauthorizedError extends GatewayError {
  readonly code = "UNAUTHORIZED";
  readonly httpStatus = 401;
  constructor(message = "Missing or invalid gateway API key.") {
    super(message);
  }
}

export class RateLimitExceededError extends GatewayError {
  readonly code = "RATE_LIMIT_EXCEEDED";
  readonly httpStatus = 429;
  override readonly retryable = true;
  constructor(message = "Too many requests. Slow down and retry later.") {
    super(message);
  }
}

export class SafetyPolicyViolationError extends GatewayError {
  readonly code = "SAFETY_POLICY_VIOLATION";
  readonly httpStatus = 400;
  constructor(message: string) {
    super(message);
  }
}

/**
 * Raised by a provider adapter. `retryable` distinguishes a transient
 * upstream problem (timeout, 5xx, rate limit) from a permanent one
 * (invalid credentials, unsupported model) so the router knows whether
 * falling back to the next candidate is appropriate.
 */
export class ProviderError extends GatewayError {
  readonly code = "PROVIDER_ERROR";
  readonly httpStatus = 502;
  override readonly retryable: boolean;
  readonly provider: string;

  constructor(
    provider: string,
    message: string,
    options: { retryable: boolean; cause?: unknown },
  ) {
    super(message, { cause: options.cause });
    this.provider = provider;
    this.retryable = options.retryable;
  }
}

export class ProviderTimeoutError extends ProviderError {
  constructor(provider: string, timeoutMs: number) {
    super(provider, `Provider "${provider}" timed out after ${timeoutMs}ms.`, {
      retryable: true,
    });
  }
}

export class ProviderNotConfiguredError extends ProviderError {
  constructor(provider: string) {
    super(provider, `Provider "${provider}" has no credentials configured.`, {
      retryable: false,
    });
  }
}

export class SchemaValidationError extends GatewayError {
  readonly code = "SCHEMA_VALIDATION_FAILED";
  readonly httpStatus = 502;
  readonly issues: string[];

  constructor(taskId: string, issues: string[]) {
    super(
      `Structured output for task "${taskId}" failed schema validation after all repair attempts.`,
    );
    this.issues = issues;
  }
}

/** A registered task has no entry in the routing table. This is a deployment misconfiguration, never a client error. */
export class RouteNotConfiguredError extends GatewayError {
  readonly code = "ROUTE_NOT_CONFIGURED";
  readonly httpStatus = 500;
  constructor(taskId: string) {
    super(`Task "${taskId}" is registered but has no routing table entry in route-config.ts.`);
  }
}

/**
 * A bug or bad deployment configuration inside the gateway itself - e.g. a
 * task declares structuredOutput but has no outputSchema wired up. This is
 * never the client's fault and never a transient provider problem, so it
 * must fail loudly (surface as a 500, stop the candidate loop immediately)
 * rather than being absorbed as "just another failed candidate" - see
 * `isFailoverEligible` and docs/architecture.md#failover-classification.
 */
export class InternalConfigurationError extends GatewayError {
  readonly code = "INTERNAL_CONFIGURATION_ERROR";
  readonly httpStatus = 500;
  constructor(message: string) {
    super(message);
  }
}

export class AllProvidersFailedError extends GatewayError {
  readonly code = "ALL_PROVIDERS_FAILED";
  readonly httpStatus = 502;
  readonly attempts: Array<{ provider: string; model: string; reason: string }>;

  constructor(taskId: string, attempts: Array<{ provider: string; model: string; reason: string }>) {
    super(`All configured providers/fallbacks failed for task "${taskId}".`);
    this.attempts = attempts;
  }
}

/** Narrows an unknown error into a client-safe { code, message } pair. Never leaks stack traces or provider payloads. */
export function toClientSafeError(error: unknown): { code: string; httpStatus: number; message: string } {
  if (error instanceof GatewayError) {
    return { code: error.code, httpStatus: error.httpStatus, message: error.message };
  }
  return { code: "INTERNAL_ERROR", httpStatus: 500, message: "An internal error occurred." };
}

/**
 * Decides whether a candidate's failure is the kind that justifies trying
 * the next provider/model, or a bug/misconfiguration that must fail loudly
 * instead. Failover is appropriate for candidate-specific problems: an
 * upstream outage, a timeout, a rate limit, a provider/model rejecting the
 * request (a different candidate may still succeed), or a candidate
 * exhausting its own schema-repair attempts. It is NOT appropriate for an
 * internal/configuration defect (`InternalConfigurationError`) or any other
 * unexpected error the gateway doesn't recognize as provider-related -
 * those must propagate immediately so they surface as a loud 500 instead of
 * being silently indistinguishable from a normal provider outage. See
 * InferenceService.run() and docs/architecture.md#failover-classification.
 */
export function isFailoverEligible(error: unknown): boolean {
  return error instanceof ProviderError || error instanceof SchemaValidationError;
}
