# ADR 0004: Mock is a test fixture, never a production fallback

## Status

Accepted. Supersedes the original V1 routing design.

## Context

The original V1 routing table (`src/router/route-config.ts`) listed `mock`
as the last fallback entry for every task, so the gateway was runnable
end-to-end with zero provider credentials - useful for local development and
the default test suite. The problem: this made `mock` indistinguishable, at
the routing layer, from a real degraded-but-legitimate fallback provider. If
NVIDIA, OpenAI, and Anthropic were all simultaneously down or misconfigured
in a real deployment, the router would happily fall through to `mock` and
return a schema-valid but entirely fabricated result - for
`talentsquad.extract_job`, that could mean a placeholder URL, a synthetic
timestamp, and null/zero fields returned to an application as if extraction
had actually succeeded. An application has no way to distinguish that from a
real (if sparse) result. That is worse than an explicit failure.

## Decision

`mock` is removed from `route-config.ts` entirely - the production routing
table contains no reference to it, for either task. Three independent layers
now keep it from ever silently servicing a real request:

1. **Registry**: `buildProviderRegistry` (`src/providers/registry.ts`) only
   constructs a `MockProvider` when `ENABLE_MOCK_PROVIDER=true`. By default,
   in every environment including local development, `mock` simply does not
   exist in the provider map.
2. **Router**: `resolveCandidates` (`src/router/router.ts`) filters out any
   `mock` entry it might encounter while walking the route table (defense in
   depth against a future editing mistake) and only ever *appends* `mock` as
   a final candidate when the caller explicitly passes
   `{ allowMockFallback: true }` - which `InferenceService` only does when
   constructed with that option, which `createApp` (`src/app.ts`) only sets
   from `config.ENABLE_MOCK_PROVIDER`.
3. **Readiness**: `isTaskRoutableWithRealProviders` (`src/router/router.ts`),
   which backs `GET /ready`, never considers `mock` under any configuration -
   a deployment cannot appear "ready" because mock is available.

The one path that still runs against `mock` freely is explicit selection:
the benchmark harness (`benchmark/run-benchmark.ts`) always has a `mock`
entry in its own provider map, regardless of `ENABLE_MOCK_PROVIDER`, and
`InferenceService`'s `override` option (used only by the benchmark harness
and tests, never exposed on the public HTTP API) lets a caller target it by
name. That is "explicit selection," not "automatic fallback" - the caller
asked for mock by name, rather than the router silently arriving there after
every real option failed.

## Consequences

- With `ENABLE_MOCK_PROVIDER` unset (the default everywhere, including local
  development), an inference request with no real provider available fails
  with `ALL_PROVIDERS_FAILED` (502), not a fabricated success. See
  `tests/unit/mock-fallback-gating.test.ts`.
- Local development that wants the old zero-credential, always-succeeds
  behavior sets `ENABLE_MOCK_PROVIDER=true` explicitly - a visible, opt-in
  choice, not the default.
- The default unit-test suite still needs no live credentials: most tests
  construct a provider map directly (bypassing `buildProviderRegistry`
  entirely) or use `override` to target a fake/mock provider explicitly,
  neither of which depends on this flag.
- `GET /ready` now means something: it reports `not_ready` whenever a
  registered task has no real, configured route, regardless of whether mock
  happens to be enabled.
