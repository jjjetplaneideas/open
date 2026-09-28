import type { GatewayConfig } from "../config/env.js";
import { AnthropicProvider } from "./anthropic/anthropic-provider.js";
import { MockProvider } from "./mock/mock-provider.js";
import { NvidiaNimProvider } from "./nvidia-nim/nvidia-nim-provider.js";
import { OpenAIProvider } from "./openai/openai-provider.js";
import type { AIProvider } from "./types.js";

/**
 * Builds every provider adapter from config. Providers without credentials
 * are still constructed (so isConfigured()/healthCheck() can report why they
 * are unavailable) but the router skips them - see src/router/router.ts.
 * Adding a new provider means: implement AIProvider, add one line here, and
 * add it to a task's fallback list. See docs/adding-a-provider.md.
 *
 * The "mock" provider is only constructed when config.ENABLE_MOCK_PROVIDER
 * is explicitly true - it is a test/evaluation fixture, not a real provider,
 * and should not even exist in a production registry by default. See
 * docs/adr/0004-mock-is-not-a-fallback.md. This is defense in depth on top
 * of route-config.ts never referencing it and the router's allowMockFallback
 * being opt-in: even if both of those were somehow bypassed, a default
 * (unconfigured) deployment's registry simply has no "mock" entry to find.
 */
export function buildProviderRegistry(config: GatewayConfig): Map<string, AIProvider> {
  const providers: AIProvider[] = [
    new NvidiaNimProvider({ apiKey: config.NVIDIA_NIM_API_KEY, baseUrl: config.NVIDIA_NIM_BASE_URL }),
    new OpenAIProvider({ apiKey: config.OPENAI_API_KEY, baseUrl: config.OPENAI_BASE_URL }),
    new AnthropicProvider({
      apiKey: config.ANTHROPIC_API_KEY,
      baseUrl: config.ANTHROPIC_BASE_URL,
      version: config.ANTHROPIC_VERSION,
    }),
  ];

  if (config.ENABLE_MOCK_PROVIDER) {
    providers.push(new MockProvider());
  }

  return new Map(providers.map((provider) => [provider.id, provider]));
}
