import { describe, expect, it } from "vitest";
import { UnknownTaskError } from "../../src/inference/errors.js";
import { getTask, isRegisteredTask, listTasks } from "../../src/tasks/registry.js";

describe("task registry", () => {
  it("resolves a registered task by id", () => {
    const task = getTask("talentsquad.extract_job");
    expect(task.id).toBe("talentsquad.extract_job");
    expect(task.structuredOutput).toBe(true);
  });

  it("rejects unknown task ids", () => {
    expect(() => getTask("not.a.real.task")).toThrow(UnknownTaskError);
  });

  it("reports registration status without throwing", () => {
    expect(isRegisteredTask("anglerj.explain_conditions")).toBe(true);
    expect(isRegisteredTask("does.not.exist")).toBe(false);
  });

  it("lists every registered task", () => {
    const ids = listTasks().map((t) => t.id);
    expect(ids).toContain("talentsquad.extract_job");
    expect(ids).toContain("anglerj.explain_conditions");
  });
});
