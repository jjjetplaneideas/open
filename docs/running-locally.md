# Running locally

## Setup

```bash
npm install
cp .env.example .env   # edit as needed - see below
```

By default (`GATEWAY_API_KEYS` unset), the server runs **unauthenticated** and
logs a warning. This is only acceptable in local development -
`loadConfig()` (`src/config/env.ts`) refuses to boot with `NODE_ENV=production`
and no keys configured.

Without any provider credentials and without `ENABLE_MOCK_PROVIDER` set, the
server still boots and `/health` still returns `ok`, but `/ready` correctly
reports `not_ready` (no task has a real, configured route) and `POST
/v1/inference` fails with `ALL_PROVIDERS_FAILED` - by design, see
`docs/adr/0004-mock-is-not-a-fallback.md`. Set `ENABLE_MOCK_PROVIDER=true` in
your `.env` if you want the gateway runnable end-to-end with zero real
credentials for local development - that explicitly re-enables `mock` as a
last-resort fallback for real requests. `/ready` still won't report `ready`
in that mode (mock is never counted toward readiness), which is intentional:
readiness means "a real provider is available," not "the server would
respond to something."

## Run the server

```bash
npm run dev     # tsx watch, restarts on change
npm run build   # compile to dist/
npm start       # run the compiled server
```

The server listens on `PORT` (default `8787`).

```bash
curl -s http://localhost:8787/health
curl -s http://localhost:8787/ready
curl -s -X POST http://localhost:8787/v1/inference \
  -H 'content-type: application/json' \
  -d '{"task":"talentsquad.extract_job","input":{"sourceUrl":"https://example.com/job/1","sourceTimestamp":null,"sourceConfidence":"VERIFIED_RECENT","rawText":"Line Cook wanted, Salty Pelican Tiki Bar, seasonal."}}'
```

With no provider keys set and `ENABLE_MOCK_PROVIDER` unset, that request
fails with `ALL_PROVIDERS_FAILED` (502) - see above. Set
`ENABLE_MOCK_PROVIDER=true` to have it fall back to `mock` and return a
schema-valid (but placeholder) structured result instead.

## Setting provider credentials

Copy real values into `.env` (never commit it):

```bash
NVIDIA_NIM_API_KEY=nvapi-...      # https://build.nvidia.com
OPENAI_API_KEY=sk-...
ANTHROPIC_API_KEY=sk-ant-...
```

`GET /ready` reports, per task, whether it has at least one real configured
route, and per provider, whether it's configured and whether a live
connectivity probe just succeeded - see
`docs/architecture.md#readiness-and-health-semantics`:

```json
{
  "status": "ready",
  "tasks": [
    { "task": "talentsquad.extract_job", "routable": true, "configuredProviders": ["nvidia-nim"] },
    { "task": "anglerj.explain_conditions", "routable": true, "configuredProviders": ["nvidia-nim"] }
  ],
  "providers": [
    { "provider": "nvidia-nim", "configured": true, "healthy": true },
    { "provider": "openai", "configured": false, "healthy": false, "reason": "no API key configured" },
    ...
  ]
}
```

Overall `status` is `ready` only when every task's `routable` is `true`.
`mock` never appears in `configuredProviders`, even with
`ENABLE_MOCK_PROVIDER=true`.

## Running tests

```bash
npm test              # unit tests - no live API keys required, all providers mocked
npm run test:watch    # watch mode
npm run typecheck
npm run lint
```

### Integration tests (opt-in, live credentials)

`npm run test:integration` runs `tests/integration/`, gated behind
`FAIR_EXCHANGE_RUN_LIVE_TESTS=1`. These make real calls to whichever
providers you've configured credentials for, and are never run by CI or the
default `npm test`. There are none checked in yet in V1 - see
`docs/production-limitations.md` for what's deferred.

## Running benchmarks

See `docs/benchmarks.md`.
