import type {
  AIProvider,
  GenerateMultimodalOptions,
  GenerateOptions,
  GenerateResult,
  GenerateStructuredOptions,
  HealthStatus,
} from "../../../src/providers/types.js";

export interface FakeProviderScript {
  /** One entry consumed per call to generate/generateStructured, in order. The last entry repeats if calls exceed the script length. */
  responses: Array<
    | { text: string }
    | { throw: Error }
    | { delayMs: number; text: string }
  >;
}

/** A fully scriptable AIProvider for exercising the router/inference-service without any network access. */
export class FakeProvider implements AIProvider {
  readonly supportedModalities = ["text"] as const;
  private callCount = 0;
  public calls: GenerateOptions[] = [];

  constructor(
    readonly id: string,
    private readonly script: FakeProviderScript,
    private readonly configured = true,
  ) {}

  isConfigured(): boolean {
    return this.configured;
  }

  async healthCheck(): Promise<HealthStatus> {
    return { healthy: this.configured };
  }

  async generate(options: GenerateOptions): Promise<GenerateResult> {
    this.calls.push(options);
    return this.nextResult();
  }

  async generateStructured(options: GenerateStructuredOptions): Promise<GenerateResult> {
    this.calls.push(options);
    return this.nextResult();
  }

  async generateMultimodal(_options: GenerateMultimodalOptions): Promise<GenerateResult> {
    return this.nextResult();
  }

  private async nextResult(): Promise<GenerateResult> {
    const index = Math.min(this.callCount, this.script.responses.length - 1);
    const entry = this.script.responses[index];
    this.callCount += 1;

    if (!entry) {
      throw new Error("FakeProvider script exhausted");
    }
    if ("throw" in entry) {
      throw entry.throw;
    }
    if ("delayMs" in entry) {
      await new Promise((resolve) => setTimeout(resolve, entry.delayMs));
      return { text: entry.text, usage: {} };
    }
    return { text: entry.text, usage: {} };
  }
}
