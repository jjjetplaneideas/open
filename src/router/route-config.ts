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
 * production-grade infrastructure - see docs/production-limitations.md
 * before relying on it in production.
 *
 * The "mock" provider is always the last fallback for every task. It has no
 * external dependency, so the gateway is runnable end-to-end (and every unit
 * test passes) with zero configured credentials.
 */
export const ROUTE_CONFIG: Record<string, TaskRoute> = {
  "talentsquad.extract_job": {
    primary: { provider: "nvidia-nim", model: "meta/llama-3.1-70b-instruct" },
    fallback: [
      { provider: "openai", model: "gpt-4o-mini" },
      { provider: "anthropic", model: "claude-3-5-haiku-20241022" },
      { provider: "mock", model: "mock-structured-v1" },
    ],
  },
  "anglerj.explain_conditions": {
    primary: { provider: "nvidia-nim", model: "meta/llama-3.1-70b-instruct" },
    fallback: [
      { provider: "openai", model: "gpt-4o-mini" },
      { provider: "anthropic", model: "claude-3-5-haiku-20241022" },
      { provider: "mock", model: "mock-text-v1" },
    ],
  },
};

export function getRoute(taskId: string): TaskRoute | undefined {
  return ROUTE_CONFIG[taskId];
}
