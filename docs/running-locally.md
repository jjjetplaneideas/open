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

You do not need any provider credentials to run the gateway - the `mock`
provider is always available and is the last fallback for every task.

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

With no provider keys set, that request falls back all the way to `mock` and
returns a schema-valid (but placeholder) structured result.

## Setting provider credentials

Copy real values into `.env` (never commit it):

```bash
NVIDIA_NIM_API_KEY=nvapi-...      # https://build.nvidia.com
OPENAI_API_KEY=sk-...
ANTHROPIC_API_KEY=sk-ant-...
```

`GET /ready` reports which providers are configured and healthy without
requiring a real inference call:

```json
{
  "status": "ready",
  "tasks": ["talentsquad.extract_job", "anglerj.explain_conditions"],
  "providers": [
    { "provider": "nvidia-nim", "configured": true, "healthy": true },
    { "provider": "openai", "configured": false, "healthy": false, "reason": "no API key configured" },
    ...
  ]
}
```

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
