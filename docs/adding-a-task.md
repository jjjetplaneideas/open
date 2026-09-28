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
   (a BoltBeacon alert, a Tracking calculation, a trading risk flag), it is
   `SAFETY_EXPLANATION_ONLY`, not `NORMAL`.
3. **Write the prompt.** See "Adding a prompt" below.
4. **Register the task.** Add one entry to `src/tasks/registry.ts`.
5. **Add a routing table entry.** Add one entry to
   `src/router/route-config.ts` - see "Switching model routes" below. A
   registered task with no route entry fails fast with
   `RouteNotConfiguredError` (a 500 - this is a deployment misconfiguration,
   not a client error).
6. **Add benchmark fixtures + an assertion function** if the task should be
   evaluated across models - see `docs/benchmarks.md`.
7. **Write unit tests.** At minimum: valid input succeeds, invalid input is
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
    { provider: "mock", model: "mock-structured-v1" },
  ],
},
```

The router tries `primary` first, then each `fallback` entry in order,
skipping any provider that isn't registered or isn't configured (no
credentials). Always keep `mock` as the last fallback for tasks you want
runnable with zero external credentials (which should be all of them, in
V1). This is a plain data change - no application code, task definition, or
provider adapter needs to change to move a task from one model to another.

If a task should be architecturally restricted to certain providers
regardless of the routing table (e.g. a future `HIGH_RISK` task limited to
audited providers), set `allowedProviders` on the task definition - the
router filters the routing table against it.
