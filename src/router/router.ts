import { RouteNotConfiguredError } from "../inference/errors.js";
import type { AIProvider } from "../providers/types.js";
import type { AnyTaskDefinition } from "../tasks/types.js";
import type { ProviderModelRef } from "../types/index.js";
import { getRoute } from "./route-config.js";

export interface RouteCandidate {
  provider: AIProvider;
  model: string;
}

/**
 * Deterministic model routing. Given a task, returns the ordered list of
 * (provider, model) candidates the inference service should try: primary
 * first, then each fallback in the order configured. This intentionally
 * does no scoring, learning, or "let an AI pick the AI" behavior - see
 * docs/architecture.md#routing for why V1 keeps this a plain, auditable
 * table walk. Candidates whose provider isn't in the registry, isn't
 * configured (no credentials), or isn't allowed for this task are skipped
 * rather than attempted and failed.
 */
export function resolveCandidates(
  task: AnyTaskDefinition,
  providers: Map<string, AIProvider>,
): RouteCandidate[] {
  const route = getRoute(task.id);
  if (!route) {
    throw new RouteNotConfiguredError(task.id);
  }

  const refs: ProviderModelRef[] = [route.primary, ...route.fallback];
  const candidates: RouteCandidate[] = [];

  for (const ref of refs) {
    if (task.allowedProviders && !task.allowedProviders.includes(ref.provider)) {
      continue;
    }
    const provider = providers.get(ref.provider);
    if (!provider) continue;
    if (!provider.isConfigured()) continue;
    candidates.push({ provider, model: ref.model });
  }

  return candidates;
}
