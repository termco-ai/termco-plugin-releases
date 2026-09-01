import { describe, expect, it } from "vitest";
import { BUILTIN_AGENTS } from "./builtins";

describe("built-in AI library agents", () => {
  it("owns one complete, uniquely identified built-in catalogue", () => {
    expect(BUILTIN_AGENTS.length).toBeGreaterThan(0);
    expect(new Set(BUILTIN_AGENTS.map((agent) => agent.id)).size).toBe(
      BUILTIN_AGENTS.length,
    );
    expect(BUILTIN_AGENTS).toContainEqual(
      expect.objectContaining({
        id: "builtin:plugin-creator",
        name: "Plugin Creator",
        preferredToolGroups: ["plugin-dev", "files"],
      }),
    );
    for (const agent of BUILTIN_AGENTS) {
      expect(agent.instructions.trim(), agent.id).not.toBe("");
    }
  });
});
