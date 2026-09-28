import type { ProviderModelRef } from "../types/index.js";

export interface TaskRoute {
  primary: ProviderModelRef;
  fallback: ProviderModelRef[];
}

/**
 * The routing table: which provider/model handles each task, in priority
 * order. This is the one file you edit to change models - it is deliberately
 * separate from src/tasks (business rules) and src/providers (adapters), so
 * "switch talentsquad.extract_job from NVIDIA to OpenAI" is a one-line diff
 * here, not a code change to the task or a provider. See
 * docs/adding-a-task.md#switching-model-routes.
 *
 * NVIDIA NIM is listed first for both tasks because it is our first
 * experimental/open-model provider (see docs/architecture.md#why-nvidia-nim-first),
 * useful for development and benchmarking. It is not assumed to be
 * production-grade infrastructure - NVIDIA's free API Catalog tier is
 * itself marked deprecated by NVIDIA, separate from any individual model's
 * lifecycle - see docs/production-limitations.md before relying on it in
 * production.
 *
 * Anthropic's fallback model (`claude-haiku-4-5`) is the current Haiku
 * generation as of this writing, chosen for this route's balanced
 * cost/latency/quality target and a longer remaining lifecycle than an
 * already-superseded prior-generation model. Model IDs age - when
 * Anthropic ships a newer default-tier model, update this file's model
 * string, not the provider adapter. See docs/production-limitations.md#model-lifecycle.
 *
 * The "mock" provider deliberately has NO entry anywhere in this table.
 * Mock is a test/evaluation fixture, never an inference provider of last
 * resort: if every real provider listed here fails, the request must fail
 * with ALL_PROVIDERS_FAILED, not silently succeed with placeholder data.
 * See docs/adr/0004-mock-is-not-a-fallback.md. The router (src/router/router.ts)
 * has one narrow, explicitly-opt-in mechanism (ENABLE_MOCK_PROVIDER) for
 * appending mock as a last-resort candidate in local development/tests -
 * that mechanism is intentionally kept out of this file so the production
 * routing table can never silently grow a mock entry by accident.
 */
export const ROUTE_CONFIG: Record<string, TaskRoute> = {
  "talentsquad.extract_job": {
    primary: { provider: "nvidia-nim", model: "meta/llama-3.1-70b-instruct" },
    fallback: [
      { provider: "openai", model: "gpt-4o-mini" },
      { provider: "anthropic", model: "claude-haiku-4-5" },
    ],
  },
  "anglerj.explain_conditions": {
    primary: { provider: "nvidia-nim", model: "meta/llama-3.1-70b-instruct" },
    fallback: [
      { provider: "openai", model: "gpt-4o-mini" },
      { provider: "anthropic", model: "claude-haiku-4-5" },
    ],
  },
};

export function getRoute(taskId: string): TaskRoute | undefined {
  return ROUTE_CONFIG[taskId];
}
