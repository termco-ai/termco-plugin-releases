import { describe, expect, it, vi } from "vitest";
import {
  createWorkflowParameterSourceRegistry,
  createWorkflowRunnerRegistry,
} from "./registry";

describe("workflow adapter registries", () => {
  it("removes and restores one runner without replacing the registry", () => {
    const registry = createWorkflowRunnerRegistry();
    const listener = vi.fn();
    registry.subscribe(listener);
    const runner = {
      id: "terminal",
      targetKinds: ["focused_terminal"] as const,
      available: () => true,
      run: async () => ({ ok: true as const, command: "echo ok" }),
    };

    const remove = registry.register(runner);
    expect(registry.resolve({ kind: "focused_terminal" })).toBe(runner);
    remove();
    expect(registry.resolve({ kind: "focused_terminal" })).toBeUndefined();
    expect(listener).toHaveBeenCalledTimes(2);
  });

  it("resolves parameter sources independently", () => {
    const registry = createWorkflowParameterSourceRegistry();
    const branch = {
      id: "git",
      sources: ["branch", "git_remote"] as const,
      options: async () => [],
    };
    registry.register(branch);
    expect(registry.resolve("branch")).toBe(branch);
    expect(registry.resolve("container")).toBeUndefined();
  });
});
