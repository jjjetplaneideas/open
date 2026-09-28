import type {
  AIProvider,
  GenerateMultimodalOptions,
  GenerateOptions,
  GenerateResult,
  GenerateStructuredOptions,
  HealthStatus,
} from "../types.js";

/**
 * Deterministic in-memory provider used by the default unit-test suite and
 * as the last entry in every task's fallback chain, so the gateway is
 * runnable end-to-end with zero external credentials. It never calls the
 * network. Behavior is intentionally simple and inspectable rather than
 * "smart" - it is a fixture, not a model.
 */
export class MockProvider implements AIProvider {
  readonly id = "mock";
  readonly supportedModalities = ["text", "multimodal"] as const;

  isConfigured(): boolean {
    return true;
  }

  async healthCheck(): Promise<HealthStatus> {
    return { healthy: true };
  }

  async generate(options: GenerateOptions): Promise<GenerateResult> {
    const lastUser = [...options.messages].reverse().find((m) => m.role === "user");
    return {
      text: `[mock:${options.model}] acknowledged ${lastUser?.content.length ?? 0} chars of input.`,
      usage: { inputTokens: estimateTokens(options.messages.map((m) => m.content).join(" ")), outputTokens: 12 },
      resolvedModel: options.model,
    };
  }

  async generateStructured(options: GenerateStructuredOptions): Promise<GenerateResult> {
    const shape = buildMockValueForSchema(options.jsonSchema);
    return {
      text: JSON.stringify(shape),
      usage: { inputTokens: estimateTokens(options.messages.map((m) => m.content).join(" ")), outputTokens: 40 },
      resolvedModel: options.model,
    };
  }

  async generateMultimodal(options: GenerateMultimodalOptions): Promise<GenerateResult> {
    return {
      text: `[mock:${options.model}] acknowledged ${options.images.length} image(s).`,
      usage: { inputTokens: 10, outputTokens: 10 },
      resolvedModel: options.model,
    };
  }
}

function estimateTokens(text: string): number {
  return Math.max(1, Math.ceil(text.length / 4));
}

/**
 * Produces a schema-conformant placeholder value for the mock provider's
 * structured responses, so schema validation tests exercise the real
 * validator rather than a hand-written fixture that could drift from the
 * schema.
 */
function buildMockValueForSchema(schema: Record<string, unknown>): unknown {
  const type = schema.type;
  if (Array.isArray(type)) {
    if (type.includes("null")) return null;
    return buildMockValueForSchema({ ...schema, type: type[0] });
  }
  if (type === "object") {
    const properties = (schema.properties as Record<string, Record<string, unknown>>) ?? {};
    const result: Record<string, unknown> = {};
    for (const [key, subSchema] of Object.entries(properties)) {
      result[key] = buildMockValueForSchema(subSchema);
    }
    return result;
  }
  if (type === "array") {
    return [];
  }
  if (type === "string") {
    const enumValues = schema.enum as string[] | undefined;
    if (enumValues && enumValues.length > 0) return enumValues[0];
    if (schema.format === "uri") return "https://example.com/mock-value";
    if (schema.format === "date-time") return new Date().toISOString();
    return "mock-value";
  }
  if (type === "number" || type === "integer") {
    return 0;
  }
  if (type === "boolean") {
    return false;
  }
  return null;
}
