import { OpenAICompatibleProvider } from "../openai-compatible-base.js";

/**
 * NVIDIA NIM / API Catalog exposes an OpenAI-compatible `/chat/completions`
 * endpoint for its hosted open models, so it reuses the shared base rather
 * than a bespoke client. This is our first experimental/open-model provider -
 * see docs/architecture.md#why-nvidia-nim-first. Nothing about the router or
 * task registry is NVIDIA-specific; swapping this out for another
 * OpenAI-compatible open-model host (Groq, Together, Fireworks, a
 * self-hosted vLLM) is a config change, not a rewrite.
 */
export class NvidiaNimProvider extends OpenAICompatibleProvider {
  constructor(config: { apiKey: string; baseUrl: string }) {
    super({ id: "nvidia-nim", apiKey: config.apiKey, baseUrl: config.baseUrl });
  }
}
