# ADR 0002: The gateway never becomes the source of truth for a safety decision

## Status

Accepted.

## Context

Several Fair Exchange applications have deterministic safety- or
correctness-critical systems that must not be second-guessed by an LLM:

- **BoltBeacon**: a deterministic lightning-safety engine produces one of
  `MONITORING` / `LIGHTNING NEARBY` / `SEEK SHELTER` / `EXTREME PROXIMITY`.
- **Anglerj**: a verified fact layer (weather, tides, solunar, regulations,
  scoring, safety) sits between raw data sources and AnglerjAi.
- **Tracking**: coordinate conversion, bearing/azimuth math, and other
  navigation calculations must remain deterministic.
- **Trading tools**: risk limits, position sizing, order controls, and kill
  switches must remain deterministic; an LLM must never become the execution
  authority.

At the same time, an LLM is genuinely useful for *narrating* what a
deterministic system already decided ("here's why conditions look good today",
"here's why you're seeing a lightning-nearby alert").

## Decision

`SafetyClassification` (`src/types/index.ts`) has four levels:

- `NORMAL` - no special constraint.
- `ADVISORY` - the model may discuss a computed value (e.g. a fishing
  condition score) but isn't deciding anything safety-critical.
- `SAFETY_EXPLANATION_ONLY` - the model may only narrate a decision that
  deterministic code already made. It must never be given latitude to
  redecide it.
- `HIGH_RISK` - reserved for tasks (none implemented in V1) adjacent to
  execution/risk authority; same restriction as above, stricter framing.

For the latter two, `src/safety/classification.ts` enforces one concrete,
checkable rule today: **the task must reject any input containing a
caller-supplied `systemPrompt` field.** This closes the most obvious way a
caller could try to redirect a narration-only task into making a decision it
isn't allowed to make. Every response for a safety-boundary task also carries
a `safetyDisclaimer` string making the boundary explicit rather than implicit.

No task registered in V1 (`talentsquad.extract_job`, `anglerj.explain_conditions`)
is itself safety-critical - `anglerj.explain_conditions` is `ADVISORY`, not
`SAFETY_EXPLANATION_ONLY`, because it explains a fishing-condition score, not
a safety state. The classification and its enforcement exist now so that when
`boltbeacon.explain_alert`, `tracking.explain_*`, or `trading.*` tasks are
added, they inherit this boundary from day one instead of it being retrofitted
under time pressure.

## Consequences

- Adding a safety-adjacent task later means classifying it correctly (do not
  default to `NORMAL`) - see `docs/adding-a-task.md`.
- The gateway will refuse, at the API layer, to let a client smuggle
  instructions into a safety-bound task via a system-prompt-shaped input
  field. It does not (yet) attempt deeper content-level enforcement (e.g.
  scanning free text for "ignore previous instructions") - that is a
  reasonable V2 hardening step, tracked in `docs/production-limitations.md`.
- This is an architectural guarantee, not a model-behavior guarantee: it
  constrains what the *gateway* will pass through, not what a given model
  might say. Prompts for safety-adjacent tasks must still be written
  defensively (see the Anglerj explanation prompt as a template).
