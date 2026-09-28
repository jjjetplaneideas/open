import { Router } from "express";
import type { AIProvider } from "../../providers/types.js";
import { listTasks } from "../../tasks/registry.js";

export function createHealthRouter(providers: Map<string, AIProvider>): Router {
  const router = Router();

  router.get("/health", (_req, res) => {
    res.json({ status: "ok" });
  });

  router.get("/ready", async (_req, res) => {
    const providerStatus = await Promise.all(
      Array.from(providers.values()).map(async (provider) => ({
        provider: provider.id,
        configured: provider.isConfigured(),
        ...(await provider.healthCheck()),
      })),
    );

    const tasks = listTasks().map((task) => task.id);
    const ready = tasks.length > 0;

    res.status(ready ? 200 : 503).json({ status: ready ? "ready" : "not_ready", tasks, providers: providerStatus });
  });

  return router;
}
