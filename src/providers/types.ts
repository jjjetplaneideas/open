import type { Modality } from "../types/index.js";

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface GenerateOptions {
  model: string;
  messages: ChatMessage[];
  maxOutputTokens?: number;
  temperature?: number;
  timeoutMs: number;
}

export interface GenerateStructuredOptions extends GenerateOptions {
  /** JSON Schema describing the required output shape. Providers that support native structured/JSON modes should use it; others fall back to instruction-based prompting. */
  jsonSchema: Record<string, unknown>;
  schemaName: string;
}

export interface GenerateMultimodalOptions extends GenerateOptions {
  images: Array<{ url: string } | { base64: string; mimeType: string }>;
}

export interface UsageInfo {
  inputTokens?: number;
  outputTokens?: number;
}

export interface GenerateResult {
  text: string;
  usage: UsageInfo;
  /** Raw provider-reported model id, when the provider echoes it back (useful when "latest" aliases resolve to a dated snapshot). */
  resolvedModel?: string;
}

export interface HealthStatus {
  healthy: boolean;
  reason?: string;
}

/**
 * Shared adapter interface every provider implements. Application code and
 * the router only ever depend on this interface, never on a provider SDK
 * directly - that is what keeps providers swappable.
 */
export interface AIProvider {
  readonly id: string;
  readonly supportedModalities: readonly Modality[];

  generate(options: GenerateOptions): Promise<GenerateResult>;
  generateStructured(options: GenerateStructuredOptions): Promise<GenerateResult>;
  generateMultimodal(options: GenerateMultimodalOptions): Promise<GenerateResult>;

  /** Cheap, cached-friendly check. Should not make a full inference call. */
  healthCheck(): Promise<HealthStatus>;

  /** Whether this adapter has the credentials/config it needs to run at all. */
  isConfigured(): boolean;
}
