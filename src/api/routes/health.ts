import { Router } from "express";
import type { AIProvider, HealthStatus } from "../../providers/types.js";
import { evaluateTaskReadiness, resolveCandidates } from "../../router/router.js";
import { listTasks } from "../../tasks/registry.js";

/**
 * /health: pure liveness - the process is up and can answer HTTP requests.
 * It says nothing about whether the gateway can actually serve inference.
 *
 * /ready: operational readiness - for every registered task, does at least
 * one REAL (non-mock) configured candidate have a routed model that a live
 * probe either confirmed exists or couldn't rule out? A task registry that
 * isn't empty, or a provider that merely has an API key, is necessary but
 * not sufficient for readiness - a configured provider whose routed model
 * has been retired is exactly the gap this closes. Mock is never counted
 * here, even if ENABLE_MOCK_PROVIDER is set - see `resolveCandidates`
 * (called here with no `allowMockFallback`) and
 * docs/adr/0004-mock-is-not-a-fallback.md.
 *
 * A candidate's model is checked against `HealthStatus.availableModels`
 * (populated by each provider's live models-list probe - see each
 * provider's healthCheck()). Definitively missing disqualifies that
 * candidate; a failed/unavailable probe does not - see
 * `classifyModelAvailability` in src/router/router.ts for why: transient
 * provider latency alone must never make this endpoint flap, only a live,
 * successfully-parsed model list that actually excludes the model does.
 */
export function createHealthRouter(providers: Map<string, AIProvider>): Router {
  const router = Router();

  router.get("/health", (_req, res) => {
    res.json({ status: "ok" });
  });

  router.get("/ready", async (_req, res) => {
    const tasks = listTasks();

    // Only probe providers at least one task's real route actually depends on.
    const providersInUse = new Set(
      tasks.flatMap((task) => resolveCandidates(task, providers).map((c) => c.provider.id)),
    );
    const healthByProviderId = new Map<string, HealthStatus>();
    await Promise.all(
      [...providersInUse].map(async (id) => {
        const provider = providers.get(id);
        if (provider) healthByProviderId.set(id, await provider.healthCheck());
      }),
    );

    const taskReadiness = tasks.map((task) => ({
      task: task.id,
      ...evaluateTaskReadiness(task, providers, healthByProviderId),
    }));

    const providerStatus = Array.from(providers.values()).map((provider) => ({
      provider: provider.id,
      configured: provider.isConfigured(),
      ...(healthByProviderId.get(provider.id) ?? {
        healthy: false,
        reason: "not on any registered task's active route; not probed",
      }),
    }));

    const ready = taskReadiness.length > 0 && taskReadiness.every((t) => t.routable);

    res.status(ready ? 200 : 503).json({
      status: ready ? "ready" : "not_ready",
      tasks: taskReadiness,
      providers: providerStatus,
    });
  });

  return router;
}
