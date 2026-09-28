import type { AnyTaskDefinition } from "../tasks/types.js";

/**
 * Architectural guardrails tied to a task's SafetyClassification. This
 * module is intentionally small: it does not (and must not) make safety
 * decisions itself. It only enforces the boundary that keeps the gateway
 * from silently becoming the source of truth for a safety decision - see
 * docs/architecture.md#safety-boundary and ADR 0002.
 */

/** SAFETY_EXPLANATION_ONLY and HIGH_RISK tasks may only narrate a decision made elsewhere; they can never accept a caller-supplied system prompt that could redirect them into making one. */
export function assertNoUserSuppliedSystemPrompt(task: AnyTaskDefinition, input: unknown): void {
  if (task.safety !== "SAFETY_EXPLANATION_ONLY" && task.safety !== "HIGH_RISK") return;
  if (input && typeof input === "object" && "systemPrompt" in (input as Record<string, unknown>)) {
    throw new Error(
      `Task "${task.id}" is classified ${task.safety} and may not accept a caller-supplied system prompt.`,
    );
  }
}

/** Every response for a safety-boundary task includes a machine-readable reminder that the gateway is not the decision authority. Applications should surface this, not hide it. */
export function safetyDisclaimerFor(task: AnyTaskDefinition): string | undefined {
  if (task.safety === "SAFETY_EXPLANATION_ONLY") {
    return "This explanation narrates a decision made by deterministic application logic. The gateway/model does not determine safety state.";
  }
  if (task.safety === "HIGH_RISK") {
    return "HIGH_RISK task: output must not be treated as authoritative for risk, execution, or safety decisions.";
  }
  return undefined;
}
