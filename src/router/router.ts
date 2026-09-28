import { RouteNotConfiguredError } from "../inference/errors.js";
import type { AIProvider } from "../providers/types.js";
import type { AnyTaskDefinition } from "../tasks/types.js";
import type { ProviderModelRef } from "../types/index.js";
import { getRoute } from "./route-config.js";

export interface RouteCandidate {
  provider: AIProvider;
  model: string;
}

export interface ResolveCandidatesOptions {
  /**
   * Appends the "mock" provider as one final, explicit candidate after every
   * real fallback in `route-config.ts` has been exhausted - never inserted
   * anywhere else, and never on by default. This is the ONLY path by which
   * mock can ever service a normal inference request; production leaves this
   * false (or omitted), so an outage of every real provider surfaces as
   * ALL_PROVIDERS_FAILED, not a fake successful response. Set this only for
   * local development/tests that explicitly want the gateway runnable with
   * zero credentials - see ENABLE_MOCK_PROVIDER in .env.example and
   * docs/adr/0004-mock-is-not-a-fallback.md. The benchmark harness does not
   * use this option: it targets mock explicitly via `override` instead.
   */
  allowMockFallback?: boolean;
}

const MOCK_PROVIDER_ID = "mock";

/**
 * Deterministic model routing. Given a task, returns the ordered list of
 * (provider, model) candidates the inference service should try: primary
 * first, then each fallback in the order configured. This intentionally
 * does no scoring, learning, or "let an AI pick the AI" behavior - see
 * docs/architecture.md#routing for why V1 keeps this a plain, auditable
 * table walk. Candidates whose provider isn't in the registry, isn't
 * configured (no credentials), or isn't allowed for this task are skipped
 * rather than attempted and failed.
 *
 * The "mock" provider is filtered out of the route-config walk unconditionally,
 * even if a future edit mistakenly adds it there - defense in depth on top of
 * route-config.ts never listing it. It is only ever appended, as the final
 * candidate, when `options.allowMockFallback` is explicitly true. See
 * docs/adr/0004-mock-is-not-a-fallback.md.
 */
export function resolveCandidates(
  task: AnyTaskDefinition,
  providers: Map<string, AIProvider>,
  options?: ResolveCandidatesOptions,
): RouteCandidate[] {
  const route = getRoute(task.id);
  if (!route) {
    throw new RouteNotConfiguredError(task.id);
  }

  const refs: ProviderModelRef[] = [route.primary, ...route.fallback];
  const candidates: RouteCandidate[] = [];

  for (const ref of refs) {
    if (ref.provider === MOCK_PROVIDER_ID) continue;
    if (task.allowedProviders && !task.allowedProviders.includes(ref.provider)) {
      continue;
    }
    const provider = providers.get(ref.provider);
    if (!provider) continue;
    if (!provider.isConfigured()) continue;
    candidates.push({ provider, model: ref.model });
  }

  if (options?.allowMockFallback) {
    const mock = providers.get(MOCK_PROVIDER_ID);
    if (mock && (!task.allowedProviders || task.allowedProviders.includes(MOCK_PROVIDER_ID))) {
      candidates.push({ provider: mock, model: task.structuredOutput ? "mock-structured-v1" : "mock-text-v1" });
    }
  }

  return candidates;
}

/**
 * Whether a task currently has at least one REAL (non-mock) configured
 * provider it could route to, ignoring `allowMockFallback` entirely. This is
 * the readiness signal used by GET /ready - mock must never make a
 * deployment appear ready to serve production traffic, so this function
 * never considers it, regardless of ENABLE_MOCK_PROVIDER. See
 * src/api/routes/health.ts.
 */
export function isTaskRoutableWithRealProviders(
  task: AnyTaskDefinition,
  providers: Map<string, AIProvider>,
): { routable: boolean; configuredProviders: string[] } {
  const candidates = resolveCandidates(task, providers);
  return {
    routable: candidates.length > 0,
    configuredProviders: [...new Set(candidates.map((c) => c.provider.id))],
  };
}
