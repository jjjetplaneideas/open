import { Router } from "express";
import type { AIProvider } from "../../providers/types.js";
import { isTaskRoutableWithRealProviders } from "../../router/router.js";
import { listTasks } from "../../tasks/registry.js";

/**
 * /health: pure liveness - the process is up and can answer HTTP requests.
 * It says nothing about whether the gateway can actually serve inference.
 *
 * /ready: operational readiness - can every registered task currently reach
 * at least one REAL (non-mock) configured provider through its route? A
 * task registry that isn't empty is necessary but not sufficient for
 * readiness; this checks the thing that actually matters. Mock is never
 * counted here, even if ENABLE_MOCK_PROVIDER is set - see
 * isTaskRoutableWithRealProviders and docs/adr/0004-mock-is-not-a-fallback.md.
 * Per-provider `healthy` (a live, cheap connectivity probe - see each
 * provider's healthCheck()) is reported for operators, but the overall
 * ready/not_ready verdict is based on the minimum bar: does each task have a
 * *configured* real route. Basing readiness on live probes as well would
 * make /ready flap on transient network blips; see
 * docs/production-limitations.md.
 */
export function createHealthRouter(providers: Map<string, AIProvider>): Router {
  const router = Router();

  router.get("/health", (_req, res) => {
    res.json({ status: "ok" });
  });

  router.get("/ready", async (_req, res) => {
    const tasks = listTasks();
    const taskReadiness = tasks.map((task) => {
      const { routable, configuredProviders } = isTaskRoutableWithRealProviders(task, providers);
      return { task: task.id, routable, configuredProviders };
    });

    // Only probe providers that at least one task's real route actually depends on.
    const providersInUse = new Set(taskReadiness.flatMap((t) => t.configuredProviders));
    const healthByProviderId = new Map<string, Awaited<ReturnType<AIProvider["healthCheck"]>>>();
    await Promise.all(
      [...providersInUse].map(async (id) => {
        const provider = providers.get(id);
        if (provider) healthByProviderId.set(id, await provider.healthCheck());
      }),
    );

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
