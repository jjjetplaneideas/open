# Fair Exchange AI Gateway

A provider-agnostic AI inference gateway for The Fair Exchange studio.
Applications request a **task** (a capability), not a model or provider - the
gateway decides how to fulfill it and keeps providers/models replaceable.

```json
{ "task": "talentsquad.extract_job", "input": { "...": "..." } }
```

not

```
call model X from provider Y
```

## Why

Fair Exchange runs multiple independent applications (Anglerj, Talent Squad, a
game project, Never Miss the Sunsets, trading tools, and more) that each need
LLM inference. Integrating each one directly with OpenAI/Anthropic/NVIDIA
would lock every application to whatever provider it happened to pick first.
This gateway is the one place provider/model decisions live, so they can
change without touching application code. See
`docs/adr/0001-task-not-model.md`.

## Quick start

```bash
npm install
cp .env.example .env
npm run dev
```

The server boots and answers `/health` with zero provider credentials, but a
real `/v1/inference` call needs at least one real provider configured (or
`ENABLE_MOCK_PROVIDER=true` for local development) - mock is a test fixture,
never an automatic production fallback. See `docs/running-locally.md` and
`docs/adr/0004-mock-is-not-a-fallback.md`.

## Documentation

- [`docs/architecture.md`](docs/architecture.md) - how a request flows through the system, module map, routing, safety boundary, privacy/logging
- [`docs/adr/0001-task-not-model.md`](docs/adr/0001-task-not-model.md) - why applications request tasks, not models
- [`docs/adr/0002-safety-boundary.md`](docs/adr/0002-safety-boundary.md) - why the gateway never becomes the source of truth for a safety decision
- [`docs/adr/0003-deterministic-provenance.md`](docs/adr/0003-deterministic-provenance.md) - why authoritative fields are attached in code, never trusted from the model
- [`docs/adr/0004-mock-is-not-a-fallback.md`](docs/adr/0004-mock-is-not-a-fallback.md) - why mock can never silently service a production request
- [`docs/adding-a-provider.md`](docs/adding-a-provider.md)
- [`docs/adding-a-task.md`](docs/adding-a-task.md) - adding a task, a prompt, switching model routes
- [`docs/running-locally.md`](docs/running-locally.md) - setup, running the server, tests, credentials
- [`docs/benchmarks.md`](docs/benchmarks.md) - running and reading model benchmarks
- [`docs/production-limitations.md`](docs/production-limitations.md) - what's deferred in V1

## Status (V1)

- **Providers**: NVIDIA NIM (first experimental/open-model provider), OpenAI,
  Anthropic, and a credential-free `mock` provider used only by the default
  test suite and explicit benchmark/dev opt-in - never an automatic
  production fallback (`ENABLE_MOCK_PROVIDER`, default off everywhere).
- **Tasks**: `talentsquad.extract_job` (structured job-listing extraction) and
  `anglerj.explain_conditions` (grounded fact explanation).
- **Benchmark harness**: `npm run benchmark` - runs fixtures through every
  configured candidate and scores correctness, not just JSON-parseability.
- **Tests**: `npm test` - all provider calls mocked, zero live credentials
  required.

Repository note: this project lives at the root of the `open` repo (a clean,
studio-wide infrastructure repo) rather than inside any single application's
repo, per the design brief's instruction not to couple shared infrastructure
to one application.
