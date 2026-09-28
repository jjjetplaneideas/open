# Production limitations (V1)

This is a deliberately small V1. Before relying on it in production, be aware
of what's intentionally deferred:

## Infrastructure

- **No database.** `EvaluationStore` is in-memory and process-local; restart
  the process and history is gone. Fine for local benchmarking; not fine as a
  durable audit log. If you need one, implement the same interface
  (`src/telemetry/evaluation-store.ts`) against a real store.
- **No distributed rate limiting.** `createRateLimitMiddleware`
  (`src/security/rate-limit.ts`) is a per-process in-memory fixed window. Running
  multiple replicas behind a load balancer means each replica enforces its own
  limit independently - effectively multiplying the real limit by replica
  count. Move to a shared store (Redis, etc.) before scaling out.
- **No circuit breaker.** The router retries the next candidate on failure,
  but does not track rolling provider health across requests to proactively
  skip a provider that's currently down - every request re-discovers a dead
  provider via a failed call. A real circuit breaker (open/half-open/closed)
  is a reasonable V2 addition to `src/router/`.

## NVIDIA NIM specifically

NVIDIA NIM / API Catalog is excellent for development and benchmarking
against open models, but:

- Free/development-tier endpoints have **no production SLA** and may have
  different rate limits, availability, or terms than a paid/self-hosted
  deployment.
- Do not assume a model you benchmarked against the hosted API Catalog
  behaves identically to a self-hosted NIM container (different quantization,
  batching, or version pinning are all possible).
- Before shipping a user-facing feature on NIM in production, confirm the
  licensing/deployment tier you're actually using, not the one you
  benchmarked with.

This is exactly the risk the design brief called out: "we should not assume
free development endpoints can simply become our production infrastructure."
The routing table (`src/router/route-config.ts`) makes it a one-line change
to move a task off NIM once you've made that call per-task.

## Authentication

`GATEWAY_API_KEYS` is a flat shared-secret list - any valid key can call any
registered task, with no per-application scoping or per-key rate limits.
Reasonable evolution path, roughly in order of effort: per-application keys
with a scoping table (which apps may call which tasks), signed short-lived
tokens instead of static keys, mTLS between internal services. None of this
is implemented in V1.

## Safety boundary

The safety boundary (`docs/adr/0002-safety-boundary.md`) currently enforces
one concrete rule: a caller cannot pass a `systemPrompt`-shaped field into a
`SAFETY_EXPLANATION_ONLY`/`HIGH_RISK` task's input. It does not do
content-level inspection of free-text input for prompt-injection attempts.
If/when `boltbeacon.explain_alert`, `tracking.*`, or `trading.*` tasks are
added, revisit whether stronger input sanitization is warranted before
shipping them.

## Cost tracking

`InferenceRecord.estimatedCostUsd` exists as a field but nothing currently
populates it - provider pricing changes often enough that hardcoding it here
would go stale quickly. Populate it in the relevant provider adapter (using
`usage.inputTokens`/`usage.outputTokens` and that provider's current pricing)
when you want real cost comparisons out of the benchmark harness.

## Multimodal

`generateMultimodal` is implemented on every provider adapter (per the
`AIProvider` interface), but no multimodal task is registered in V1 - Anglerj's
future catch-photo analysis is the most likely first real user. Wire it up
the same way as the two existing tasks once there's a concrete input/output
shape to validate against.

## Retry policy

Fallback moves to the *next provider* on any failure (provider error, timeout,
or exhausted schema-repair attempts) - it does not retry the *same* provider
beyond the bounded schema-repair loop. If you want same-provider retry with
backoff for transient errors, add it inside the relevant provider adapter's
HTTP call, not in the router (keep the router's job limited to "which
candidate is next").
