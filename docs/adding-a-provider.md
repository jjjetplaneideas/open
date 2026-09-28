# Adding a provider

A provider is anything that implements `AIProvider` (`src/providers/types.ts`):

```ts
interface AIProvider {
  readonly id: string;
  readonly supportedModalities: readonly Modality[];
  generate(options: GenerateOptions): Promise<GenerateResult>;
  generateStructured(options: GenerateStructuredOptions): Promise<GenerateResult>;
  generateMultimodal(options: GenerateMultimodalOptions): Promise<GenerateResult>;
  healthCheck(): Promise<HealthStatus>;
  isConfigured(): boolean;
}
```

## Steps

1. **Create the adapter.** Add `src/providers/<name>/<name>-provider.ts`.
   - If the provider exposes an OpenAI-compatible `/chat/completions` API
     (Groq, Together, Fireworks, a self-hosted vLLM server, etc.), extend
     `OpenAICompatibleProvider` (`src/providers/openai-compatible-base.ts`)
     the way `src/providers/nvidia-nim/nvidia-nim-provider.ts` does - it's a
     ~10 line file.
   - Otherwise, write a bespoke adapter the way
     `src/providers/anthropic/anthropic-provider.ts` does: implement all four
     methods, throw `ProviderNotConfiguredError` when credentials are
     missing, wrap the HTTP call in an `AbortController` keyed to
     `options.timeoutMs`, and throw `ProviderTimeoutError` on abort.
   - Map non-2xx responses to `ProviderError` with `retryable` set correctly
     (429/5xx → `true`, 4xx client errors → `false`). Never include the raw
     response body in the thrown error message - log it via `Logger`
     server-side only if you need it for debugging (see `docs/architecture.md#privacy-and-logging`).
2. **Add config.** Add its API key/base URL to `src/config/env.ts` and
   `.env.example` (never commit a real key).
3. **Register it.** Add one line to `src/providers/registry.ts`.
4. **Route a task to it.** Add it as a primary or fallback entry in
   `src/router/route-config.ts` for whichever task should use it - see
   `docs/adding-a-task.md#switching-model-routes`.
5. **Test it without live credentials.** Unit tests should mock `fetch`
   (see `tests/unit/openai-compatible-provider.test.ts` for the pattern) so
   the default `npm test` run never needs a real API key. If you want an
   opt-in live smoke test, put it in `tests/integration/` - see
   `docs/running-locally.md#integration-tests`.

## What you get for free

Once a provider implements `AIProvider` and is registered, it automatically
participates in: the router's fallback chain, structured-output
validation/repair, telemetry recording, and the benchmark harness (pass
`--models <provider>/<model>` to `npm run benchmark`). Nothing outside
`src/providers/` needs to know it exists.
