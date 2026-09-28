import { ProviderError, ProviderNotConfiguredError, ProviderTimeoutError } from "../inference/errors.js";
import type {
  AIProvider,
  GenerateMultimodalOptions,
  GenerateOptions,
  GenerateResult,
  GenerateStructuredOptions,
  HealthStatus,
} from "./types.js";

interface OpenAICompatibleConfig {
  id: string;
  apiKey: string;
  baseUrl: string;
  /** Extra headers beyond Authorization, e.g. NVIDIA does not need any today but a future provider might. */
  extraHeaders?: Record<string, string>;
}

/** Short timeout for the health-check probe only - independent of any task's timeoutMs, since GET /ready should stay fast even if a provider is slow to respond. */
const HEALTH_CHECK_TIMEOUT_MS = 5_000;

/**
 * Base implementation shared by any provider exposing an OpenAI-compatible
 * `/chat/completions` endpoint (OpenAI itself, and NVIDIA NIM, which
 * deliberately mirrors OpenAI's request/response shape). This is a
 * convenience for providers that happen to share a wire format - it does not
 * weaken the AIProvider abstraction, since callers never depend on this
 * class directly.
 */
export class OpenAICompatibleProvider implements AIProvider {
  readonly id: string;
  readonly supportedModalities = ["text", "multimodal"] as const;
  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly extraHeaders: Record<string, string>;

  constructor(config: OpenAICompatibleConfig) {
    this.id = config.id;
    this.apiKey = config.apiKey;
    this.baseUrl = config.baseUrl.replace(/\/+$/, "");
    this.extraHeaders = config.extraHeaders ?? {};
  }

  isConfigured(): boolean {
    return this.apiKey.length > 0;
  }

  /**
   * `healthy: true` means a live GET to this provider's models-list endpoint
   * just succeeded - it is evidence of current reachability, not merely that
   * an API key is present (that is `isConfigured()`, reported separately by
   * callers - see src/api/routes/health.ts). This deliberately avoids a real
   * completion/generation call: listing models costs no tokens and is one of
   * the cheapest authenticated endpoints most OpenAI-compatible APIs expose.
   * Not cached - see docs/production-limitations.md if GET /ready is polled
   * often enough for this to matter.
   */
  async healthCheck(): Promise<HealthStatus> {
    if (!this.isConfigured()) {
      return { healthy: false, reason: "no API key configured" };
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), HEALTH_CHECK_TIMEOUT_MS);

    try {
      const response = await fetch(`${this.baseUrl}/models`, {
        method: "GET",
        headers: { authorization: `Bearer ${this.apiKey}`, ...this.extraHeaders },
        signal: controller.signal,
      });
      if (response.ok) {
        return { healthy: true };
      }
      return { healthy: false, reason: `models endpoint returned HTTP ${response.status}` };
    } catch (error) {
      if (controller.signal.aborted) {
        return { healthy: false, reason: `connectivity check timed out after ${HEALTH_CHECK_TIMEOUT_MS}ms` };
      }
      return { healthy: false, reason: `connectivity check failed: ${(error as Error).message}` };
    } finally {
      clearTimeout(timeout);
    }
  }

  async generate(options: GenerateOptions): Promise<GenerateResult> {
    return this.chatCompletion(options, {});
  }

  async generateStructured(options: GenerateStructuredOptions): Promise<GenerateResult> {
    return this.chatCompletion(options, {
      response_format: {
        type: "json_schema",
        json_schema: {
          name: options.schemaName,
          strict: true,
          schema: options.jsonSchema,
        },
      },
    });
  }

  async generateMultimodal(options: GenerateMultimodalOptions): Promise<GenerateResult> {
    const lastMessage = options.messages[options.messages.length - 1];
    const otherMessages = options.messages.slice(0, -1);
    const content: unknown[] = [{ type: "text", text: lastMessage?.content ?? "" }];
    for (const image of options.images) {
      content.push({
        type: "image_url",
        image_url: { url: "url" in image ? image.url : `data:${image.mimeType};base64,${image.base64}` },
      });
    }
    return this.chatCompletion(
      {
        ...options,
        messages: [...otherMessages, { role: "user", content: JSON.stringify(content) }],
      },
      {},
      content,
    );
  }

  private async chatCompletion(
    options: GenerateOptions,
    extraBody: Record<string, unknown>,
    multimodalContent?: unknown[],
  ): Promise<GenerateResult> {
    if (!this.isConfigured()) {
      throw new ProviderNotConfiguredError(this.id);
    }

    const messages = multimodalContent
      ? [...options.messages.slice(0, -1), { role: "user", content: multimodalContent }]
      : options.messages;

    const body = {
      model: options.model,
      messages,
      max_tokens: options.maxOutputTokens ?? 1024,
      temperature: options.temperature ?? 0.2,
      ...extraBody,
    };

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), options.timeoutMs);

    try {
      const response = await fetch(`${this.baseUrl}/chat/completions`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${this.apiKey}`,
          ...this.extraHeaders,
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });

      if (!response.ok) {
        const retryable = response.status === 429 || response.status >= 500;
        const errorBody = await safeReadText(response);
        throw new ProviderError(this.id, `Provider "${this.id}" returned HTTP ${response.status}.`, {
          retryable,
          cause: errorBody,
        });
      }

      const json = (await response.json()) as OpenAICompatibleResponse;
      const choice = json.choices?.[0];
      const text = choice?.message?.content ?? "";

      return {
        text,
        usage: {
          inputTokens: json.usage?.prompt_tokens,
          outputTokens: json.usage?.completion_tokens,
        },
        resolvedModel: json.model,
      };
    } catch (error) {
      if (error instanceof ProviderError) throw error;
      if (controller.signal.aborted) {
        throw new ProviderTimeoutError(this.id, options.timeoutMs);
      }
      throw new ProviderError(this.id, `Provider "${this.id}" request failed: ${(error as Error).message}`, {
        retryable: true,
        cause: error,
      });
    } finally {
      clearTimeout(timeout);
    }
  }
}

interface OpenAICompatibleResponse {
  model?: string;
  choices?: Array<{ message?: { content?: string } }>;
  usage?: { prompt_tokens?: number; completion_tokens?: number };
}

async function safeReadText(response: Response): Promise<string> {
  try {
    return await response.text();
  } catch {
    return "<unreadable response body>";
  }
}
