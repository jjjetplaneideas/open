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
- **No caching on health probes.** Each `GET /ready` call re-runs a live,
  uncached connectivity probe (a models-list GET) against every provider a
  registered task's route depends on - see "Correct provider health check
  semantics" below. A deployment polling `/ready` very frequently (e.g. an
  aggressive Kubernetes readiness probe interval) will generate a
  corresponding rate of lightweight provider calls. Add a short TTL cache
  in front of `healthCheck()` if this becomes a concern; V1 keeps it simple
  and always-fresh instead.

## NVIDIA NIM specifically

NVIDIA NIM / API Catalog is excellent for development and benchmarking
against open models, but:

- **NVIDIA has marked its free API Catalog tier deprecated.** This is a
  statement about the *free credential path/tier itself*, separate from
  whether any individual model (e.g. `meta/llama-3.1-70b-instruct`, still
  listed in NVIDIA's API Catalog as of this writing) remains callable
  through it. Do not treat "the model still has an API definition" as
  evidence the tier serving it is durable - those are two different
  questions, and only the second one is about lifecycle risk. Before
  depending on this route for anything beyond development/benchmarking,
  confirm current status directly against NVIDIA's own API Catalog/NIM
  documentation, and budget time to move to a paid tier or a self-hosted NIM
  container.
- This repo could not verify live NVIDIA reachability as part of this pass -
  no `NVIDIA_NIM_API_KEY` was present in the environment this hardening work
  ran in. `GET /ready` (see "Correct provider health check semantics" below)
  will report NVIDIA's real-time status once real credentials are
  configured; run it before trusting this route in any environment.
- Free/development-tier endpoints have **no production SLA** and may have
  different rate limits, availability, or terms than a paid/self-hosted
  deployment, independent of the deprecation notice above.
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

## Model lifecycle

Model IDs are not permanent - providers retire and rename them on their own
schedule, independent of this codebase. `src/router/route-config.ts` had
exactly this problem: it referenced `claude-3-5-haiku-20241022`, a retired
Anthropic model ID, until this was caught in review and replaced with
`claude-haiku-4-5` (the current Haiku-tier model as of this writing, chosen
for a longer remaining lifecycle over migrating to another soon-superseded
ID). GET /ready's live model-existence check (see "Correct provider health
check semantics" below) is the automated guard against this recurring
silently - but it only runs against providers you've configured credentials
for, and only when this endpoint is actually polled. There is no scheduled
job in V1 that periodically re-verifies every routed model ID against every
provider independent of `/ready` traffic; add one if that matters for your
deployment.

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

## Provider health checks

`healthCheck()` performs one lightweight, unauthenticated-cost GET to the
provider's models-list endpoint (see `docs/architecture.md#readiness-and-health-semantics`).
This is real evidence of reachability, not a guess, and (since this
hardening pass) the same response also populates `availableModels`, which
`GET /ready` compares against each task's routed model IDs - see "Correct
provider health check semantics" below and
`src/router/router.ts#classifyModelAvailability`. This closes the specific
gap that let a retired model ID (`claude-3-5-haiku-20241022`) sit unnoticed
in the routing table.

What it still does not prove: that a generation/completion request will
succeed (rate limits, content-policy rejections, and transient 5xx errors
are all possible on an otherwise-healthy, model-verified provider), or that
the account has sufficient quota for real traffic. Treat `healthy: true` +
a "verified" model status as "the provider is reachable, the key is valid,
and this specific model currently exists," not as "the next inference call
is guaranteed to succeed."

## Anglerj safety-state contract

`AnglerjSafetyStateSchema` (`src/tasks/anglerj/explain-conditions.ts`) is
currently a bounded string, not Anglerj's real closed enum - that enum isn't
available in this repository. This means the gateway will currently accept
*any* short string as a safety state, including a typo or a value Anglerj's
real system would never produce. This is a deliberate, documented trade-off
(see `docs/adr/0003-deterministic-provenance.md`) rather than an oversight:
inventing a plausible-but-wrong enum here would risk silently rejecting a
real Anglerj safety state at runtime, which is worse. Replace this schema
with the real enum as soon as it's available to this repo or its build
(a shared package, a generated client from an OpenAPI/JSON-Schema contract,
or a contract test against Anglerj's actual output).

## Model benchmarking

The two fixtures per task under `benchmark/fixtures/` prove the benchmark
harness itself works end-to-end (loads fixtures, runs every configured
candidate, scores per-field correctness, writes results) - they do not
constitute a production-quality model comparison. Two fixtures is not a
representative sample for choosing a production model for either
`talentsquad.extract_job` or `anglerj.explain_conditions`. Before using this
harness's output to pick a production model, feed it real, representative
Talent Squad and Anglerj fixtures (dozens to hundreds, covering edge cases
like missing compensation, ambiguous employment type, closed seasons,
elevated safety states) - see `docs/benchmarks.md#adding-a-fixture`.

## Retry policy

Fallback moves to the *next provider* on any failure (provider error, timeout,
or exhausted schema-repair attempts) - it does not retry the *same* provider
beyond the bounded schema-repair loop. If you want same-provider retry with
backoff for transient errors, add it inside the relevant provider adapter's
HTTP call, not in the router (keep the router's job limited to "which
candidate is next").
