import { describe, expect, it } from "vitest";
import { normalizeHandle, parseFrontmatter, parseMcpConfig } from "./helpers";

describe("skills adoption parsers", () => {
  it("preserves searchable metadata and normalizes adopted content", () => {
    const parsed = parseFrontmatter(
      "---\nname: Review Skill\ndescription: Reviews changes\nallowed-tools: read, git\n---\nCheck the diff.",
    );
    expect(parsed.data).toMatchObject({
      name: "Review Skill",
      description: "Reviews changes",
    });
    expect(parsed.body).toBe("Check the diff.");
    expect(normalizeHandle(" Review Skill ")).toBe("review-skill");
    expect(
      parseMcpConfig(
        JSON.stringify({ mcpServers: { docs: { command: "docs-mcp" } } }),
      ).servers,
    ).toEqual([{ name: "docs", command: "docs-mcp", args: [], env: undefined }]);
  });
});
