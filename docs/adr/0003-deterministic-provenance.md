# ADR 0003: Authoritative fields are attached in code, never trusted from the model

## Status

Accepted. Supersedes the original V1 approach for `talentsquad.extract_job`.

## Context

Talent Squad's `sourceUrl`, `sourceTimestamp`, and `sourceConfidence` are
Talent Squad's own source-record provenance - they describe where and when a
job listing was found and how confident Talent Squad's own pipeline is in it
(`VERIFIED_RECENT`, `STALE`, `RECONCILIATION_HOLD`, etc). They are not facts
about the job itself, and they are not something an LLM should ever be in a
position to change.

The original V1 implementation passed these three fields into the model's
input *and* asked it to echo them back unchanged in its structured output
("Copy sourceUrl, sourceTimestamp, and sourceConfidence exactly as given").
That is an instruction, not a boundary: nothing prevented a model from
altering, dropping, or hallucinating a different value, and the schema
happily accepted whatever it returned as long as the shape matched (e.g. a
syntactically valid URL, even if it wasn't the *same* URL). A prompt asking a
model to behave is not a trust boundary.

## Decision

The model's output schema (`ModelExtractedJobSchema` in
`src/tasks/talentsquad/extract-job.ts`) does not contain `sourceUrl`,
`sourceTimestamp`, or `sourceConfidence` at all - the model is never asked
for them and never sees a place to put them. The gateway attaches them after
validation, in deterministic code, from the already-validated request input:

```ts
postProcess: (modelOutput, input) => ({
  ...modelOutput,
  sourceUrl: input.sourceUrl,
  sourceTimestamp: input.sourceTimestamp,
  sourceConfidence: input.sourceConfidence,
}),
```

This is a general mechanism, not a one-off hack: `TaskDefinition.postProcess`
(`src/tasks/types.ts`) runs after schema validation succeeds and before a
result is returned, logged, or benchmark-scored - see
`InferenceService.run()`. Any future task with an authoritative,
non-model-derived field should use the same pattern: keep it out of the
model's schema, attach it from validated input in `postProcess`.

The `inferredFields` list the model may set is similarly closed - see
`InferableFieldSchema` in the same file - to a small, explicit set of fields
where *deriving* rather than copying verbatim is actually appropriate
(employment type, compensation normalization). Every other field, including
provenance, is structurally outside what the model can claim to have
inferred.

## Consequences

- A model attempting to return a different `sourceUrl`/`sourceTimestamp`/
  `sourceConfidence` has no effect - there is no field in its schema for
  them to land in, and even if extra keys appeared in its raw JSON,
  `postProcess`'s spread order (authoritative fields last) overwrites them
  unconditionally. See `tests/unit/provenance.test.ts`.
- Benchmark scoring for `talentsquad.extract_job` no longer checks
  "did the model echo provenance correctly" - that's no longer a question
  the model gets to answer. See `benchmark/assertions/talentsquad-extract-job.ts`.
- The prompt is simpler (`talentsquad.extract-job.v2`): it doesn't need to
  instruct the model about fields it will never see.
- This pattern generalizes to Anglerj's safety state via a parallel
  mechanism (`extractGroundingFacts`, ADR 0002) - deterministic facts are
  surfaced to the caller independent of the model's narrative, not merely
  requested from the model and hoped-for.
