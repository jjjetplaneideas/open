import { randomUUID } from "node:crypto";
import { getPrompt } from "../prompts/registry.js";
import type { AIProvider, ChatMessage } from "../providers/types.js";
import { resolveCandidates } from "../router/router.js";
import { assertNoUserSuppliedSystemPrompt, safetyDisclaimerFor } from "../safety/classification.js";
import { buildRepairInstruction, validateStructuredOutput } from "../schema/validate.js";
import { getTask } from "../tasks/registry.js";
import type { AnyTaskDefinition } from "../tasks/types.js";
import type { ContentLog, EvaluationStore, InferenceRecord } from "../telemetry/evaluation-store.js";
import type { Logger } from "../telemetry/logger.js";
import type { RequestMetadata } from "../types/index.js";
import {
  AllProvidersFailedError,
  GatewayError,
  InvalidInputError,
  SafetyPolicyViolationError,
  SchemaValidationError,
} from "./errors.js";

export interface RunTaskOptions {
  taskId: string;
  input: unknown;
  metadata?: RequestMetadata;
  /** Bypasses the router and forces a specific provider/model. Used by the benchmark harness to test one candidate at a time - never exposed on the public API. */
  override?: { provider: string; model: string };
}

export interface RunTaskResult {
  requestId: string;
  task: string;
  result: unknown;
  provider: string;
  model: string;
  promptVersion: string;
  latencyMs: number;
  schemaValid: boolean | null;
  safetyDisclaimer?: string;
}

interface CandidateOutcome {
  data: unknown;
  rawText: string;
  usage: { inputTokens?: number; outputTokens?: number };
  resolvedModel?: string;
  schemaValid: boolean | null;
}

export class InferenceService {
  constructor(
    private readonly providers: Map<string, AIProvider>,
    private readonly evaluationStore: EvaluationStore,
    private readonly contentLog: ContentLog,
    private readonly logger: Logger,
  ) {}

  async run(options: RunTaskOptions): Promise<RunTaskResult> {
    const task = getTask(options.taskId);

    try {
      assertNoUserSuppliedSystemPrompt(task, options.input);
    } catch (error) {
      throw new SafetyPolicyViolationError((error as Error).message);
    }

    const parsedInput = task.inputSchema.safeParse(options.input);
    if (!parsedInput.success) {
      const issues = parsedInput.error.issues.map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`);
      throw new InvalidInputError(`Input for task "${task.id}" failed validation: ${issues.join("; ")}`);
    }

    const requestId = options.metadata?.requestId ?? randomUUID();
    const prompt = getPrompt(task.promptId);
    const baseMessages = prompt.render(parsedInput.data);

    const candidates = options.override
      ? this.resolveOverride(options.override)
      : resolveCandidates(task, this.providers);

    if (candidates.length === 0) {
      throw new AllProvidersFailedError(task.id, []);
    }

    const attempts: Array<{ provider: string; model: string; reason: string }> = [];

    for (let attemptIndex = 0; attemptIndex < candidates.length; attemptIndex++) {
      const candidate = candidates[attemptIndex];
      if (!candidate) continue;
      const { provider, model } = candidate;
      const startedAt = Date.now();

      try {
        const outcome = await this.invokeCandidate(task, provider, model, baseMessages);
        const latencyMs = Date.now() - startedAt;

        this.recordTelemetry({
          requestId,
          task: task.id,
          provider: provider.id,
          model: outcome.resolvedModel ?? model,
          promptVersion: prompt.id,
          application: options.metadata?.application,
          latencyMs,
          success: true,
          schemaValid: outcome.schemaValid,
          inputTokens: outcome.usage.inputTokens,
          outputTokens: outcome.usage.outputTokens,
          attemptIndex,
        });
        this.contentLog.record(requestId, parsedInput.data, outcome.data);

        return {
          requestId,
          task: task.id,
          result: outcome.data,
          provider: provider.id,
          model: outcome.resolvedModel ?? model,
          promptVersion: prompt.id,
          latencyMs,
          schemaValid: outcome.schemaValid,
          safetyDisclaimer: safetyDisclaimerFor(task),
        };
      } catch (error) {
        const latencyMs = Date.now() - startedAt;
        const message = error instanceof Error ? error.message : String(error);
        const errorCode = error instanceof GatewayError ? error.code : "UNEXPECTED_ERROR";

        attempts.push({ provider: provider.id, model, reason: message });
        this.recordTelemetry({
          requestId,
          task: task.id,
          provider: provider.id,
          model,
          promptVersion: prompt.id,
          application: options.metadata?.application,
          latencyMs,
          success: false,
          schemaValid: task.structuredOutput ? false : null,
          attemptIndex,
          errorCode,
        });
        this.logger.warn("provider attempt failed", {
          requestId,
          task: task.id,
          provider: provider.id,
          model,
          errorCode,
        });
      }
    }

    throw new AllProvidersFailedError(task.id, attempts);
  }

  private resolveOverride(override: { provider: string; model: string }) {
    const provider = this.providers.get(override.provider);
    if (!provider) return [];
    return [{ provider, model: override.model }];
  }

  private async invokeCandidate(
    task: AnyTaskDefinition,
    provider: AIProvider,
    model: string,
    baseMessages: ChatMessage[],
  ): Promise<CandidateOutcome> {
    if (!task.structuredOutput) {
      const res = await provider.generate({
        model,
        messages: baseMessages,
        maxOutputTokens: task.maxOutputTokens,
        timeoutMs: task.timeoutMs,
      });
      return { data: res.text, rawText: res.text, usage: res.usage, resolvedModel: res.resolvedModel, schemaValid: null };
    }

    if (!task.outputSchema || !task.outputJsonSchema) {
      throw new InvalidInputError(`Task "${task.id}" declares structuredOutput but has no schema configured.`);
    }

    let messages = baseMessages;
    let lastIssues: string[] = [];
    let lastRawText = "";

    for (let attempt = 0; attempt <= task.maxRepairAttempts; attempt++) {
      const res = await provider.generateStructured({
        model,
        messages,
        maxOutputTokens: task.maxOutputTokens,
        timeoutMs: task.timeoutMs,
        jsonSchema: task.outputJsonSchema,
        schemaName: task.id.replace(/\./g, "_"),
      });
      lastRawText = res.text;

      const validation = validateStructuredOutput(res.text, task.outputSchema);
      if (validation.valid) {
        return {
          data: validation.data,
          rawText: res.text,
          usage: res.usage,
          resolvedModel: res.resolvedModel,
          schemaValid: true,
        };
      }

      lastIssues = validation.issues;
      messages = [
        ...messages,
        { role: "assistant", content: res.text },
        { role: "user", content: buildRepairInstruction(validation.issues) },
      ];
    }

    throw new SchemaValidationError(task.id, lastIssues.length > 0 ? lastIssues : [`Last raw response: ${lastRawText.slice(0, 500)}`]);
  }

  private recordTelemetry(entry: Omit<InferenceRecord, "timestamp">): void {
    this.evaluationStore.record({ ...entry, timestamp: new Date().toISOString() });
  }
}
