import type {
  AiLibraryCapability,
  AiLibrarySnapshot,
} from "@termco/ai-library-base";
import { describe, expect, it } from "vitest";
import { createSkillContribution } from "./tools";

describe("skill contribution", () => {
  it("loads instructions from the shared library and honors disabled state", async () => {
    const snapshot: AiLibrarySnapshot = {
      agents: [],
      customAgents: [],
      activeAgentId: "coder",
      snippets: [],
      skills: [{
        id: "review",
        name: "review",
        description: "Review code",
        body: "Inspect the diff",
        allowedGroups: ["files" as const],
        source: { origin: "builtin" as const },
      }],
      disabledSkillIds: [],
      enabledProjectSkills: {},
      enabledMcpServers: {},
      userMcpServers: [],
      disabledUserMcpServers: [],
      mcpStatus: {},
    };
    const library = {
      snapshot: async () => snapshot,
    } as unknown as AiLibraryCapability;
    const tool = createSkillContribution(library).build({}).skill;
    await expect(tool.execute?.({ name: "review" })).resolves.toMatchObject({
      ok: true,
      instructions: "Inspect the diff",
      allowedGroups: ["files"],
    });
    snapshot.disabledSkillIds.push("review");
    await expect(tool.execute?.({ name: "review" })).resolves.toMatchObject({
      error: expect.stringContaining("disabled"),
    });
  });
});
