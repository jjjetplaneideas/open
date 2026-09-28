import { Router } from "express";
import { z } from "zod";
import { InvalidInputError, UnknownTaskError } from "../../inference/errors.js";
import type { InferenceService } from "../../inference/inference-service.js";
import { isRegisteredTask } from "../../tasks/registry.js";

const InferenceRequestSchema = z.object({
  task: z.string().min(1),
  input: z.unknown(),
  metadata: z
    .object({
      application: z.string().optional(),
      requestId: z.string().optional(),
    })
    .optional(),
});

export function createInferenceRouter(inferenceService: InferenceService, exposeProviderInfo: boolean): Router {
  const router = Router();

  router.post("/v1/inference", async (req, res, next) => {
    try {
      const parsed = InferenceRequestSchema.safeParse(req.body);
      if (!parsed.success) {
        throw new InvalidInputError(
          `Malformed request body: ${parsed.error.issues.map((i) => i.message).join("; ")}`,
        );
      }

      // Only registered tasks may run. This check happens before anything else touches the task id.
      if (!isRegisteredTask(parsed.data.task)) {
        throw new UnknownTaskError(parsed.data.task);
      }

      const result = await inferenceService.run({
        taskId: parsed.data.task,
        input: parsed.data.input,
        metadata: parsed.data.metadata,
      });

      res.json({
        requestId: result.requestId,
        task: result.task,
        result: result.result,
        ...(exposeProviderInfo
          ? { provider: result.provider, model: result.model, promptVersion: result.promptVersion }
          : {}),
        schemaValid: result.schemaValid,
        latencyMs: result.latencyMs,
        ...(result.safetyDisclaimer ? { safetyDisclaimer: result.safetyDisclaimer } : {}),
      });
    } catch (error) {
      next(error);
    }
  });

  return router;
}
