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
  InternalConfigurationError,
  InvalidInputError,
  SafetyPolicyViolationError,
  SchemaValidationError,
  isFailoverEligible,
} from "./errors.js";

export interface InferenceServiceOptions {
  /**
   * Allows the router to append "mock" as a final, explicit last-resort
   * candidate when every real provider in a task's route fails or is
   * unconfigured. Defaults to false - production must never silently
   * succeed with placeholder data when every real provider is unavailable.
   * See ENABLE_MOCK_PROVIDER in .env.example and
   * docs/adr/0004-mock-is-not-a-fallback.md.
   */
  allowMockFallback?: boolean;
}

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
  /** Authoritative facts from the task's `extractGroundingFacts` hook, derived purely from validated input - never from model output. Present only for tasks that declare the hook. */
  groundingFacts?: Record<string, unknown>;
}

interface CandidateOutcome {
  data: unknown;
  rawText: string;
  usage: { inputTokens?: number; outputTokens?: number };
  resolvedModel?: string;
  schemaValid: boolean | null;
}

export class InferenceService {
  private readonly allowMockFallback: boolean;

  constructor(
    private readonly providers: Map<string, AIProvider>,
    private readonly evaluationStore: EvaluationStore,
    private readonly contentLog: ContentLog,
    private readonly logger: Logger,
    options?: InferenceServiceOptions,
  ) {
    this.allowMockFallback = options?.allowMockFallback ?? false;
  }

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
      : resolveCandidates(task, this.providers, { allowMockFallback: this.allowMockFallback });

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

        // Authoritative fields (e.g. Talent Squad provenance) are attached here,
        // in deterministic gateway code, from the validated input - never from
        // the model's own output. See TaskDefinition.postProcess.
        const finalResult = task.postProcess
          ? task.postProcess(outcome.data, parsedInput.data)
          : outcome.data;
        const groundingFacts = task.extractGroundingFacts?.(parsedInput.data);

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
        this.contentLog.record(requestId, parsedInput.data, finalResult);

        return {
          requestId,
          task: task.id,
          result: finalResult,
          provider: provider.id,
          model: outcome.resolvedModel ?? model,
          promptVersion: prompt.id,
          latencyMs,
          schemaValid: outcome.schemaValid,
          safetyDisclaimer: safetyDisclaimerFor(task),
          ...(groundingFacts ? { groundingFacts } : {}),
        };
      } catch (error) {
        const latencyMs = Date.now() - startedAt;
        const message = error instanceof Error ? error.message : String(error);
        const errorCode = error instanceof GatewayError ? error.code : "UNEXPECTED_ERROR";

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

        if (!isFailoverEligible(error)) {
          // A bug or gateway misconfiguration, not a candidate-specific
          // problem - failing over to the next provider would hide it behind
          // what looks like a normal outage. Fail loudly instead.
          this.logger.error("internal/unexpected error aborted candidate loop without failover", {
            requestId,
            task: task.id,
            provider: provider.id,
            model,
            errorCode,
          });
          throw error;
        }

        attempts.push({ provider: provider.id, model, reason: message });
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
      // A registered task is misconfigured - this is a gateway defect, not a
      // client mistake or a candidate-specific provider problem, so it must
      // never be swallowed into the failover loop. See isFailoverEligible.
      throw new InternalConfigurationError(
        `Task "${task.id}" declares structuredOutput but has no schema configured.`,
      );
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
