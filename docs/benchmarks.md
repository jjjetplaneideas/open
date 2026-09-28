# Benchmarks

The benchmark harness (`benchmark/run-benchmark.ts`) answers the questions the
design brief asked for directly: which model is best for job extraction,
which is cheapest, which follows the JSON schema most reliably, which is
fastest, which gives the best Anglerj explanations, which hallucinates least.

**Current status: the harness works, the fixtures don't yet prove a winner.**
There are two fixtures per task today - enough to prove the harness itself is
correct end-to-end (loads fixtures, drives every candidate, scores per-field
correctness, writes results), not enough to declare a production model
winner. Do not treat today's benchmark output as a production model
recommendation. See `docs/production-limitations.md#model-benchmarking` and
"Adding a fixture" below - real, representative Talent Squad and Anglerj
fixtures are the next step before this harness's results should drive a
production routing decision.

It runs the same fixed set of **fixtures** through every configured
**candidate** (provider/model) for a task, bypassing the router's fallback
logic (each candidate is tested in isolation via
`InferenceService.run({ ..., override })`, so a candidate's own failure
doesn't hide behind another provider succeeding).

## Running it

```bash
npm run benchmark                                     # every task, every configured REAL candidate
npm run benchmark -- --task talentsquad.extract_job   # one task
npm run benchmark -- --models openai/gpt-4o-mini,nvidia-nim/meta/llama-3.1-70b-instruct
npm run benchmark -- --models mock/mock-structured-v1 # explicitly exercise the mock fixture
```

Candidates without configured credentials are skipped with a note, so you can
leave this command as-is regardless of which providers you have keys for.
The default candidate list (no `--models`) comes straight from
`route-config.ts`, which never lists `mock` - see
`docs/adr/0004-mock-is-not-a-fallback.md`. Mock is always reachable via an
explicit `--models mock/...`, regardless of `ENABLE_MOCK_PROVIDER`, since
asking for it by name is exactly the "benchmark run that explicitly selects
it" carve-out.

## Reading the output

A summary table prints to stdout:

```
provider/model                          runs  success%  schemaValid%  avgLatencyMs  avgScore%
nvidia-nim/meta/llama-3.1-70b-instruct   2     100%      100%          812           92%
openai/gpt-4o-mini                       2     100%      100%          640           88%
```

- **success%** - the call completed without a provider/timeout error.
- **schemaValid%** - the structured output passed Zod validation (n/a for
  unstructured tasks like `anglerj.explain_conditions`).
- **avgScore%** - the task-specific assertion score (see below) - this is
  correctness, not just "did it parse".

Full per-fixture, per-candidate records are appended as JSON Lines to
`benchmark/results/<timestamp>.jsonl` (gitignored) with `requestId`,
`fixtureId`, `latencyMs`, `schemaValid`, `score`/`maxScore`, and a `details`
array listing exactly which assertions failed and why. This is the raw data
to build cost/latency/quality comparisons from - cost estimation is left as a
follow-up (see `docs/production-limitations.md`) since it depends on
per-provider pricing you'll want to keep current yourselves.

## Fixtures and assertions

- `benchmark/fixtures/<task-slug>/*.json` - each fixture is a realistic input
  plus an `expected` (or `expectedMentions`/`forbiddenNumbers`) block
  describing what a correct response looks like.
- `benchmark/assertions/<task-slug>.ts` - scores a task's output against a
  fixture's expectations. For `talentsquad.extract_job`
  (`assessExtractJob`), this checks field-by-field correctness (title,
  employer, compensation, employment type, `inferredFields` correctness) -
  not merely "the JSON parsed". For `anglerj.explain_conditions`
  (`assessExplainConditions`), this checks that the explanation mentions the
  facts it was actually given and does not state numbers/facts that were
  never in the payload - the "fact explanation vs. fact generation" check.

## Adding a fixture

Drop a new `.json` file into the relevant `benchmark/fixtures/<task-slug>/`
directory - no code change needed. The slug is the task id with `.`/`_`
replaced by `-` (`talentsquad.extract_job` → `talentsquad-extract-job`).

## Adding a benchmark for a new task

1. Write fixtures (above).
2. Write an assessor implementing `AssertionFn` (`benchmark/assertions/types.ts`).
3. Add one entry to the `ASSESSORS` map in `benchmark/run-benchmark.ts`.
