# ADR 0001: Applications request tasks, not models

## Status

Accepted.

## Context

Fair Exchange is building several independent applications (Anglerj, Talent
Squad, a game project, a YouTube/content tool, trading tools, and more to
come). Each has, or will have, a reason to call an LLM. The naive approach -
each application picking a provider SDK and a model name - creates two
problems:

1. **Vendor lock-in per application.** Switching providers, or reacting to a
   pricing/availability change, means auditing and changing every
   application's code.
2. **No shared place to apply cross-cutting policy.** Schema validation,
   fallback behavior, safety boundaries, and evaluation would each need to be
   reinvented per application, or (more likely) skipped.

The immediate trigger for building this gateway was identifying NVIDIA NIM as
a useful source of open-model inference for development and benchmarking. We
want to use it heavily - but we explicitly do not want that choice baked into
application code, because a free/cheap development endpoint is not the same
thing as durable production infrastructure (see
`docs/production-limitations.md`).

## Decision

Applications call the gateway with a **task id and input**, e.g.:

```json
{ "task": "talentsquad.extract_job", "input": { ... } }
```

never a provider or model. The gateway's task registry
(`src/tasks/registry.ts`) defines what a task *is* - its input/output shape,
safety classification, and preferences (latency/cost/quality). A separate
routing table (`src/router/route-config.ts`) decides which provider/model
handles it *right now*. Application code never sees or chooses either.

## Consequences

- **Provider/model changes are infrastructure changes, not application
  changes.** Swapping NVIDIA for OpenAI for a task is a diff to one file
  (`route-config.ts`), with zero application-repo changes.
- **Policy lives in one place.** Schema validation, fallback, safety
  boundaries, rate limiting, and evaluation are enforced by the gateway for
  every application uniformly.
- **The gateway becomes the natural place to benchmark models against real
  task fixtures**, because every application's traffic for a given task
  already flows through one chokepoint.
- **Cost**: applications give up direct control over exactly which model
  answers a given request. This is intentional - see ADR 0002 for the one
  place we do NOT want that trade-off (safety-critical decisions), where the
  boundary is enforced regardless of which model answers.
