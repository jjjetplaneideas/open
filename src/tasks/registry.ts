import { UnknownTaskError } from "../inference/errors.js";
import { extractJobTask } from "./talentsquad/extract-job.js";
import { explainConditionsTask } from "./anglerj/explain-conditions.js";
import type { AnyTaskDefinition } from "./types.js";

/**
 * The task registry is the single place application code's requests are
 * resolved against. It is intentionally a flat, static map rather than a
 * dynamic/self-registering system: adding a task means adding an entry here
 * and importing its module, so `grep`-ing this file always shows every task
 * the gateway can run. See docs/adding-a-task.md.
 *
 * Only tasks with real, tested backing (a schema, a prompt, a routing entry)
 * belong here. Planned tasks for other Fair Exchange apps (game.*, content.*,
 * trading.*, boltbeacon.*, tracking.*) are intentionally deferred - see
 * docs/architecture.md#roadmap - so the registry never advertises a
 * capability that isn't actually implemented.
 */
const TASKS: Record<string, AnyTaskDefinition> = {
  [extractJobTask.id]: extractJobTask as AnyTaskDefinition,
  [explainConditionsTask.id]: explainConditionsTask as AnyTaskDefinition,
};

export function getTask(taskId: string): AnyTaskDefinition {
  const task = TASKS[taskId];
  if (!task) {
    throw new UnknownTaskError(taskId);
  }
  return task;
}

export function listTasks(): AnyTaskDefinition[] {
  return Object.values(TASKS);
}

export function isRegisteredTask(taskId: string): boolean {
  return taskId in TASKS;
}
