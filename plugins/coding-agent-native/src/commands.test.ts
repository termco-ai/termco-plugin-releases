import { describe, expect, it } from "vitest";
import { describeCommand } from "./commands";

describe("describeCommand", () => {
  it("reads a frontmatter description", () => {
    const text = `---\ndescription: Ship the release\nmodel: opus\n---\n# Release\nsteps…`;
    expect(describeCommand(text)).toBe("Ship the release");
  });

  it("strips quotes from a frontmatter description", () => {
    expect(describeCommand(`---\ndescription: "Do it"\n---\nbody`)).toBe("Do it");
  });

  it("falls back to the first heading", () => {
    expect(describeCommand("# Review changes\n\nlong body")).toBe(
      "Review changes",
    );
  });

  it("falls back to the first non-empty line", () => {
    expect(describeCommand("\n\nrun the linter\nthen tests")).toBe(
      "run the linter",
    );
  });

  it("returns undefined for empty content", () => {
    expect(describeCommand("")).toBeUndefined();
    expect(describeCommand("---\n---\n")).toBeUndefined();
  });
});
// Owned by the coding-agent-native provider plugin.
