# Architecture

The Fair Exchange AI Gateway is a provider-agnostic inference service. Every Fair
Exchange application (Anglerj, Talent Squad, the game project, Never Miss the
Sunsets, trading tools, and future apps) calls it instead of integrating with
OpenAI, Anthropic, or NVIDIA directly.

```
Applications
    │
    ├── Anglerj
    ├── Talent Squad
    ├── Game project
    ├── Never Miss the Sunsets
    ├── Internal engineering tools
    └── Future Fair Exchange applications
            │
            ▼
    FAIR EXCHANGE AI GATEWAY
            │
            ├── NVIDIA NIM       (first experimental/open-model provider)
            ├── OpenAI
            ├── Anthropic
            └── future providers (Groq, Together, Fireworks, Bedrock, vLLM, Ollama...)
```

Applications send a **task id and input**, never a provider or model name. The
gateway decides how to fulfill it. See `docs/adr/0001-task-not-model.md` for why.

## Request flow

```
POST /v1/inference { task, input, metadata }
    │
    ▼
1. Task registry lookup           src/tasks/registry.ts        - rejects unknown tasks
    │
    ▼
2. Safety boundary check          src/safety/classification.ts - rejects a caller system prompt on safety-bound tasks
    │
    ▼
3. Input schema validation        task.inputSchema (Zod)       - rejects malformed input
    │
    ▼
4. Prompt rendering                src/prompts                  - versioned, not inline in application code
    │
    ▼
5. Router: candidate resolution    src/router                   - primary, then fallback, in order; mock never included by default
    │
    ▼
6. Provider call (per candidate)   src/providers                - generate() or generateStructured()
    │       │
    │       ├─ structured task: JSON-Schema/Zod validate → repair retry (bounded) → accept or fail
    │       ├─ provider/timeout/rate-limit/schema-exhausted failure: record attempt, try next candidate
    │       └─ internal/configuration error: fail loudly immediately, no failover - see "Failover classification" below
    ▼
7. Deterministic post-processing   task.postProcess / task.extractGroundingFacts - attaches authoritative fields the model never controlled
    │
    ▼
8. Telemetry record                src/telemetry/evaluation-store.ts
    │
    ▼
Response { requestId, task, result, provider?, model?, promptVersion, schemaValid, latencyMs, groundingFacts? }
```

Every layer above is independently testable and swappable. That is the point.

## Module map

| Concern | Location | Notes |
|---|---|---|
| Task registry (what a task *is*) | `src/tasks/` | Zod input/output schemas, safety class, latency/cost/quality preferences. No model names. |
| Model routing (which model handles it *right now*) | `src/router/route-config.ts` | The one file to edit to change models. Deliberately separate from task definitions - see "Routing" below. |
| Provider adapters | `src/providers/` | Implement the shared `AIProvider` interface. `mock` is a test/evaluation fixture - never in production's registry or routing table by default. See "Mock is not a fallback" below. |
| Prompts | `src/prompts/` | Versioned (`.v1`, `.v2`, ...). Every inference record carries the exact prompt version used. |
| Schema validation | `src/schema/validate.ts` | Parses + Zod-validates; never accepts "looks like JSON". Bounded repair retry. |
| Orchestration | `src/inference/inference-service.ts` | Ties registry, router, prompts, providers, schema, and telemetry together. |
| Safety boundary | `src/safety/classification.ts` | Enforces that SAFETY_EXPLANATION_ONLY/HIGH_RISK tasks can't be redirected via a caller-supplied system prompt. |
| Security | `src/security/` | API key auth, rate limiting, error sanitization. |
| Telemetry | `src/telemetry/` | Structured logging with redaction; operational metadata store; opt-in content log. |
| HTTP API | `src/api/`, `src/app.ts`, `src/index.ts` | Thin - almost no logic lives here. |
| Benchmark harness | `benchmark/` | Runs fixtures through every configured candidate, scores correctness, not just JSON-parseability. |

## Routing

Section 5-7 of the original design brief asked for two related but distinct
things:

1. A **task definition** that declares constraints: modality, structured-output
   requirement, safety class, latency/cost/quality preference, and (optionally)
   which providers are architecturally allowed at all (`allowedProviders`).
2. A **routing table** that says which provider/model is primary and which are
   fallbacks, *right now*, for a given task - and which should be changeable
   "without editing application code."

V1 keeps these separate on purpose: `src/tasks/*.ts` holds (1); `src/router/route-config.ts`
holds (2). Swapping `talentsquad.extract_job` from NVIDIA to OpenAI is a
one-line diff in `route-config.ts`, not a change to the task's business rules,
its Zod schema, or its prompt.

The router (`src/router/router.ts`) does a **deterministic, auditable walk**
through primary → fallback → ... It does not score models, learn, or use
another model to pick a model. That is intentional - see the brief's explicit
instruction not to build "an opaque AI system to choose another AI model."
Smarter routing (real-time health/cost/latency-aware selection) is a
reasonable V2, but it should stay legible: a person should always be able to
explain why a given request went where it went.

## Failover classification

Not every candidate failure should try the next provider. `isFailoverEligible`
(`src/inference/errors.ts`) draws the line: a `ProviderError` (upstream
outage, timeout, rate limit, or a provider/model rejecting the request - a
different candidate may still succeed) or a `SchemaValidationError` (a
candidate exhausted its own repair attempts) is failover-appropriate.
Anything else - an `InternalConfigurationError` (a registered task is
misconfigured, e.g. missing its output schema) or any other error the
gateway doesn't recognize as provider-related - propagates immediately and
aborts the candidate loop. The reasoning: silently trying the next provider
on a gateway bug makes that bug indistinguishable from a normal outage, and
it can burn through every configured provider's rate limit trying to route
around a problem that no provider swap will ever fix. See
`InferenceService.run()` and `tests/unit/failover-classification.test.ts`.

## Mock is not a fallback

`mock` is a credential-free test/evaluation fixture, not an inference
provider of last resort. It has **no entry anywhere** in
`src/router/route-config.ts`, is only constructed into the provider registry
when `ENABLE_MOCK_PROVIDER=true` (`src/providers/registry.ts`), and is only
ever appended as a fallback candidate when a caller explicitly opts in via
`InferenceService`'s `allowMockFallback` option - which the HTTP API only
sets from that same env var. With the default configuration (everywhere,
including local development), if every real provider in a task's route fails
or is unconfigured, the request fails with `ALL_PROVIDERS_FAILED` (502) - it
never silently succeeds with placeholder data. The benchmark harness is the
one place mock is always reachable, via explicit `--models mock/...`
selection, which is a deliberate ask for mock by name, not an automatic
fallback. See `docs/adr/0004-mock-is-not-a-fallback.md`.

## Deterministic provenance and grounding facts

Two related hooks on `TaskDefinition` (`src/tasks/types.ts`) keep specific
facts out of the model's control entirely, rather than merely instructing
the model not to touch them:

- **`postProcess(modelOutput, input)`** runs after the model's raw output
  passes schema validation. Talent Squad's `sourceUrl`/`sourceTimestamp`/
  `sourceConfidence` are not even in the model's output schema - they are
  attached here from the validated request input, in deterministic code.
  See `docs/adr/0003-deterministic-provenance.md`.
- **`extractGroundingFacts(input)`** computes facts the application should
  treat as authoritative, surfaced on the result as `groundingFacts`
  alongside the model's narrative. Anglerj's `explain_conditions` uses this
  to return the real `safety`/`score` values independent of whatever the
  narrative text says - so an application never has to trust the model to
  have correctly restated a safety-critical value.

## Why NVIDIA NIM first

NVIDIA's NIM / API Catalog exposes an OpenAI-compatible `/chat/completions`
endpoint over a wide range of open models, which makes it cheap to use during
development and benchmarking. It is deliberately **not** assumed to be
production infrastructure - see `docs/production-limitations.md`. Because NIM
mirrors OpenAI's wire format, `src/providers/nvidia-nim/` and
`src/providers/openai/` both extend `OpenAICompatibleProvider`
(`src/providers/openai-compatible-base.ts`). This is a code-reuse convenience,
not a weakening of the abstraction - nothing outside `src/providers/` knows or
cares that this sharing exists.

## Anglerj fact layer: explanation, not generation

Anglerj's product architecture is:

```
Weather / Tides / Solunar / Pressure / Regulations / Safety Engine / Catch data
        │
        ▼
VERIFIED FACT LAYER   (deterministic)
        │
        ▼
AnglerjAi              (gateway task: anglerj.explain_conditions)
        │
        ▼
Human-readable explanation
```

`anglerj.explain_conditions` receives a **fixed, already-computed** fact
payload (weather, tide, solunar, pressure, regulations, score, safety) and may
only explain it in plain language. The prompt
(`src/prompts/anglerj/explain-conditions.v1.ts`) explicitly forbids inventing
additional facts, changing the score, or re-deciding the safety state. The
benchmark assertions (`benchmark/assertions/anglerj-explain-conditions.ts`)
check exactly this: does the explanation mention the facts it was given, and
does it avoid stating numbers/facts that were never in the payload. This is
the "fact explanation vs. fact generation" distinction from the design brief.

It is classified `SAFETY_EXPLANATION_ONLY` (not `ADVISORY`): the payload
includes `safety.state`/`safety.note`, a determination deterministic Anglerj
logic already made, and this task narrates it. `extractGroundingFacts`
surfaces the real `safety`/`score` values on every result independent of the
narrative - see "Deterministic provenance and grounding facts" above - so
user safety never depends on whether the model's prose correctly restated
the state.

`safety.state`'s Zod schema (`AnglerjSafetyStateSchema` in
`src/tasks/anglerj/explain-conditions.ts`) is a bounded string, not a closed
enum - Anglerj's real safety-state vocabulary is owned by the Anglerj
application and isn't available in this repository, and hardcoding
plausible-but-wrong labels here would be worse than an open contract. This
is an explicit, documented placeholder - see
`docs/adr/0003-deterministic-provenance.md` - and should be replaced with the
real enum once it's available to this repo.

## Safety boundary

`SafetyClassification` (`src/types/index.ts`) has four levels: `NORMAL`,
`ADVISORY`, `SAFETY_EXPLANATION_ONLY`, `HIGH_RISK`. The gateway enforces one
hard rule for the latter two: they can never accept a caller-supplied
`systemPrompt` field in their input (`src/safety/classification.ts`), so a
caller cannot redirect a narration task into making a decision. This is the
architectural seam for BoltBeacon's lightning-safety state, Tracking's
navigation math, and trading's risk/execution controls, none of which are
implemented as gateway tasks in V1 (see "Roadmap" below) - but if/when they
are, this is the boundary they must respect. The gateway must never become the
source of truth for a safety decision made by deterministic application code.
`anglerj.explain_conditions` is the first task classified
`SAFETY_EXPLANATION_ONLY`, and `extractGroundingFacts` is the concrete
mechanism keeping the real safety state available independent of the model.

See `docs/adr/0002-safety-boundary.md`.

## Readiness and health semantics

`/health` is pure liveness - the process is up. `/ready`
(`src/api/routes/health.ts`) means something more specific: does every
registered task currently have at least one **real** (non-mock) candidate
whose provider is configured *and* whose specific routed model isn't
confirmed retired? A non-empty task registry, or a provider that merely has
an API key, no longer implies readiness. Mock is never counted toward
readiness under any configuration - see `resolveCandidates` (called with no
`allowMockFallback`) in `src/router/router.ts`.

Per-provider health is reported separately from configuration: `configured`
means credentials are present; `healthy` means a live, cheap connectivity
probe (a GET to the provider's models-list endpoint - no tokens spent, no
completion call made) succeeded just now. The same probe's response also
populates `availableModels`, which each task's `candidates[].modelStatus`
is checked against - `classifyModelAvailability` in `src/router/router.ts`
produces one of:

- **`verified`** - the probe succeeded and the routed model ID was found. Usable.
- **`missing`** - the probe succeeded and the routed model ID was NOT found -
  a strong signal the model has been retired or renamed (this is exactly
  what happened with `claude-3-5-haiku-20241022` before this was caught in
  review - see `docs/production-limitations.md#model-lifecycle`). A
  candidate in this state does not count toward that task's routability.
- **`unverifiable`** - the probe failed, wasn't run, or the response
  couldn't be parsed. Deliberately NOT treated as missing: a transient
  network blip or a provider without a machine-readable model inventory
  must never make `/ready` flap. A task with only `unverifiable` candidates
  is still considered routable.

The overall ready/not_ready verdict per task: routable if at least one
candidate is `verified` or `unverifiable` (i.e., not disqualified);
not-routable only when every configured candidate for that task is
definitively `missing`, or none were configured at all. This is the
deliberate, documented policy referenced above for when a live check is
allowed to affect readiness - a confirmed-missing model, never bare probe
latency.

## Privacy and logging

Two telemetry concerns are kept structurally separate
(`src/telemetry/evaluation-store.ts`):

- **`EvaluationStore`** - operational metadata only (provider, model, prompt
  version, latency, success/failure, schema validity, token counts). Always
  recorded. This is what benchmarking and observability run on.
- **`ContentLog`** - full prompt/input/output content. Disabled by default
  (`FAIR_EXCHANGE_LOG_FULL_CONTENT=false`). Only the benchmark harness and
  explicitly-flagged evaluation runs should enable it. Never store resumes,
  personal employment data, or trading information casually.

`src/telemetry/logger.ts` redacts any field whose key looks secret-shaped
before it is ever written to a log line, and no raw provider request/response
should ever be passed to `console.log` directly - always go through `Logger`.

## Authentication

Applications call the gateway with a shared API key (`x-api-key` header,
checked against `GATEWAY_API_KEYS`). Mobile apps must never hold one of these
keys - they call their own backend, and that backend calls the gateway. See
`docs/production-limitations.md` for the evolution path (per-application
scoped keys, mTLS, etc).

## Roadmap (not implemented in V1)

The design brief describes many more potential tasks across Fair Exchange
apps: `game.*`, `content.*` (Never Miss the Sunsets), `trading.*`,
`boltbeacon.explain_alert`, `tracking.explain_*`. These are deliberately
**not** registered in `src/tasks/registry.ts` yet, so the gateway never
advertises a capability it doesn't actually implement. Adding one is
mechanical - see `docs/adding-a-task.md` - and the safety boundary above
already anticipates the safety-critical ones (BoltBeacon, Tracking, trading).
