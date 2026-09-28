# Adding a task, a prompt, and switching model routes

## Adding a task

1. **Define input/output schemas.** Create `src/tasks/<app>/<task-name>.ts`
   with a Zod `inputSchema` (and `outputSchema` + `outputJsonSchema` if the
   task is structured - see `src/tasks/talentsquad/extract-job.ts` for the
   pattern of keeping "not present" (`null`) distinguishable from "inferred"
   (listed in an `inferredFields` array)). For an unstructured/grounded task,
   see `src/tasks/anglerj/explain-conditions.ts`.
2. **Classify it honestly.** Set `safety` to the most restrictive
   classification that's actually true - see `docs/adr/0002-safety-boundary.md`.
   If the task only narrates a decision made by deterministic code elsewhere
   (a BoltBeacon alert, a Tracking calculation, a trading risk flag, Anglerj's
   safety state), it is `SAFETY_EXPLANATION_ONLY`, not `ADVISORY` or `NORMAL`
   - see `anglerj.explain_conditions` for the pattern, including
   `extractGroundingFacts` (below) so the real state is never solely
   dependent on the model's narrative.
3. **Keep authoritative fields out of the model's hands.** If the task has
   any field the model must never set or change (source provenance, IDs,
   anything from `docs/adr/0003-deterministic-provenance.md`'s category),
   exclude it from `outputSchema`/`outputJsonSchema` entirely and attach it
   in `postProcess(modelOutput, input)` from the validated input instead -
   see `talentsquad.extract_job`. If the task narrates a deterministic fact
   the application must be able to rely on independent of the model (like a
   safety state), add `extractGroundingFacts(input)` to surface it on the
   result as `groundingFacts`.
4. **Write the prompt.** See "Adding a prompt" below.
5. **Register the task.** Add one entry to `src/tasks/registry.ts`.
6. **Add a routing table entry.** Add one entry to
   `src/router/route-config.ts` - see "Switching model routes" below. Never
   add a `mock` entry there - see docs/adr/0004-mock-is-not-a-fallback.md. A
   registered task with no route entry fails fast with
   `RouteNotConfiguredError` (a 500 - this is a deployment misconfiguration,
   not a client error).
7. **Add benchmark fixtures + an assertion function** if the task should be
   evaluated across models - see `docs/benchmarks.md`.
8. **Write unit tests.** At minimum: valid input succeeds, invalid input is
   rejected, and (for structured tasks) a malformed model response is
   rejected rather than silently accepted.

## Adding a prompt

Prompts live in `src/prompts/<app>/<task-name>.v<N>.ts` and implement
`PromptDefinition` (`src/prompts/types.ts`):

```ts
export const myTaskPromptV1: PromptDefinition<MyInput> = {
  id: "myapp.my-task.v1",
  render(input) {
    return [
      { role: "system", content: "..." },
      { role: "user", content: JSON.stringify(input) },
    ];
  },
};
```

Register it in `src/prompts/registry.ts`, and set the task's `promptId` to
match. **Never mutate an existing prompt's text in place** - bump the version
suffix (`.v1` → `.v2`) and add a new entry instead. Every inference and
benchmark record carries the exact `promptVersion` that produced it, which is
worthless if `.v1` doesn't always mean the same text.

## Switching model routes

`src/router/route-config.ts` is the one file to edit to change which
provider/model handles a task:

```ts
"talentsquad.extract_job": {
  primary: { provider: "nvidia-nim", model: "meta/llama-3.1-70b-instruct" },
  fallback: [
    { provider: "openai", model: "gpt-4o-mini" },
    { provider: "anthropic", model: "claude-3-5-haiku-20241022" },
  ],
},
```

The router tries `primary` first, then each `fallback` entry in order,
skipping any provider that isn't registered or isn't configured (no
credentials). **Never add `mock` here** - it is a test/evaluation fixture,
not a production fallback; if every real provider fails, the request should
fail with `ALL_PROVIDERS_FAILED`, not silently succeed with placeholder data.
See `docs/adr/0004-mock-is-not-a-fallback.md`. If you want the gateway
runnable end-to-end with zero credentials for local development, set
`ENABLE_MOCK_PROVIDER=true` instead - that is a deliberate, visible opt-in,
never the default. Editing this file is otherwise a plain data change - no
application code, task definition, or provider adapter needs to change to
move a task from one model to another.

If a task should be architecturally restricted to certain providers
regardless of the routing table (e.g. a future `HIGH_RISK` task limited to
audited providers), set `allowedProviders` on the task definition - the
router filters the routing table against it.
