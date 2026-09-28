import { OpenAICompatibleProvider } from "../openai-compatible-base.js";

export class OpenAIProvider extends OpenAICompatibleProvider {
  constructor(config: { apiKey: string; baseUrl: string }) {
    super({ id: "openai", apiKey: config.apiKey, baseUrl: config.baseUrl });
  }
}
