import { ProviderError, ProviderNotConfiguredError, ProviderTimeoutError } from "../../inference/errors.js";
import { safeParseModelIds } from "../model-list.js";
import type {
  AIProvider,
  ChatMessage,
  GenerateMultimodalOptions,
  GenerateOptions,
  GenerateResult,
  GenerateStructuredOptions,
  HealthStatus,
} from "../types.js";

interface AnthropicConfig {
  apiKey: string;
  baseUrl: string;
  version: string;
}

interface AnthropicContentBlock {
  type: string;
  text?: string;
  input?: unknown;
}

interface AnthropicResponse {
  model?: string;
  content?: AnthropicContentBlock[];
  usage?: { input_tokens?: number; output_tokens?: number };
}

const STRUCTURED_TOOL_NAME = "emit_structured_result";
/** Short timeout for the health-check probe only - independent of any task's timeoutMs. */
const HEALTH_CHECK_TIMEOUT_MS = 5_000;

/**
 * Anthropic's Messages API has a different wire format than OpenAI's, so
 * unlike NVIDIA NIM it gets its own client rather than reusing the
 * OpenAI-compatible base - but it still implements the same AIProvider
 * interface, which is the whole point of the abstraction.
 */
export class AnthropicProvider implements AIProvider {
  readonly id = "anthropic";
  readonly supportedModalities = ["text", "multimodal"] as const;
  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly version: string;

  constructor(config: AnthropicConfig) {
    this.apiKey = config.apiKey;
    this.baseUrl = config.baseUrl.replace(/\/+$/, "");
    this.version = config.version;
  }

  isConfigured(): boolean {
    return this.apiKey.length > 0;
  }

  /**
   * `healthy: true` means a live GET to Anthropic's models-list endpoint
   * just succeeded - evidence of current reachability, not merely that an
   * API key is present (that is `isConfigured()`, reported separately - see
   * src/api/routes/health.ts). Deliberately avoids a real Messages
   * (completion) call, which would cost tokens. The same response populates
   * `availableModels`, which GET /ready uses to catch a routed model that
   * has been retired - see src/router/router.ts#classifyModelAvailability.
   * Not cached - see docs/production-limitations.md.
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
        headers: { "x-api-key": this.apiKey, "anthropic-version": this.version },
        signal: controller.signal,
      });
      if (response.ok) {
        return { healthy: true, availableModels: await safeParseModelIds(response) };
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
    const response = await this.request(options, {});
    const text = (response.content ?? [])
      .filter((block) => block.type === "text")
      .map((block) => block.text ?? "")
      .join("");
    return this.toResult(response, text);
  }

  async generateStructured(options: GenerateStructuredOptions): Promise<GenerateResult> {
    const response = await this.request(options, {
      tools: [
        {
          name: STRUCTURED_TOOL_NAME,
          description: `Emit the result for schema "${options.schemaName}".`,
          input_schema: options.jsonSchema,
        },
      ],
      tool_choice: { type: "tool", name: STRUCTURED_TOOL_NAME },
    });
    const toolUse = (response.content ?? []).find((block) => block.type === "tool_use");
    if (!toolUse) {
      throw new ProviderError(this.id, "Anthropic response did not include the expected tool_use block.", {
        retryable: true,
      });
    }
    return this.toResult(response, JSON.stringify(toolUse.input ?? {}));
  }

  async generateMultimodal(options: GenerateMultimodalOptions): Promise<GenerateResult> {
    const lastMessage = options.messages[options.messages.length - 1];
    const otherMessages = options.messages.slice(0, -1);
    const imageBlocks = options.images.map((image) =>
      "url" in image
        ? { type: "image", source: { type: "url", url: image.url } }
        : { type: "image", source: { type: "base64", media_type: image.mimeType, data: image.base64 } },
    );
    const response = await this.request(
      { ...options, messages: otherMessages },
      {},
      [...imageBlocks, { type: "text", text: lastMessage?.content ?? "" }],
    );
    const text = (response.content ?? [])
      .filter((block) => block.type === "text")
      .map((block) => block.text ?? "")
      .join("");
    return this.toResult(response, text);
  }

  private toResult(response: AnthropicResponse, text: string): GenerateResult {
    return {
      text,
      usage: { inputTokens: response.usage?.input_tokens, outputTokens: response.usage?.output_tokens },
      resolvedModel: response.model,
    };
  }

  private async request(
    options: GenerateOptions,
    extraBody: Record<string, unknown>,
    finalUserContent?: unknown[],
  ): Promise<AnthropicResponse> {
    if (!this.isConfigured()) {
      throw new ProviderNotConfiguredError(this.id);
    }

    const { system, messages } = splitSystemMessage(options.messages);
    const anthropicMessages = finalUserContent
      ? [...messages, { role: "user" as const, content: finalUserContent }]
      : messages;

    const body = {
      model: options.model,
      system,
      messages: anthropicMessages,
      max_tokens: options.maxOutputTokens ?? 1024,
      temperature: options.temperature ?? 0.2,
      ...extraBody,
    };

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), options.timeoutMs);

    try {
      const response = await fetch(`${this.baseUrl}/messages`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-api-key": this.apiKey,
          "anthropic-version": this.version,
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

      return (await response.json()) as AnthropicResponse;
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

function splitSystemMessage(messages: ChatMessage[]): { system: string | undefined; messages: Array<{ role: "user" | "assistant"; content: string }> } {
  const system = messages.find((m) => m.role === "system")?.content;
  const rest = messages
    .filter((m) => m.role !== "system")
    .map((m) => ({ role: m.role as "user" | "assistant", content: m.content }));
  return { system, messages: rest };
}

async function safeReadText(response: Response): Promise<string> {
  try {
    return await response.text();
  } catch {
    return "<unreadable response body>";
  }
}
