import type { ChatMessage } from "../providers/types.js";

/**
 * A versioned prompt definition. `id` includes the version suffix (".v1",
 * ".v2", ...) so every inference/telemetry record can point at the exact
 * prompt text that produced it - see docs/adding-a-prompt.md. Bumping a
 * prompt means adding a new `id`, never mutating an existing one in place.
 */
export interface PromptDefinition<TInput = unknown> {
  id: string;
  render(input: TInput): ChatMessage[];
}
