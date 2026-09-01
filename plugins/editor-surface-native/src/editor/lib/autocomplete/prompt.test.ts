import { describe, expect, it } from "vitest";
import { buildUserPrompt, trimContext } from "./prompt";

describe("trimContext", () => {
  it("returns short context unchanged", () => {
    expect(trimContext("abc", "def")).toEqual({ prefix: "abc", suffix: "def" });
  });

  it("keeps the tail of an oversized prefix", () => {
    const prefix = `${"a".repeat(2000)}TAIL`;
    const { prefix: p } = trimContext(prefix, "");
    expect(p).toHaveLength(2000);
    expect(p.endsWith("TAIL")).toBe(true);
  });

  it("keeps the head of an oversized suffix", () => {
    const suffix = `HEAD${"b".repeat(1000)}`;
    const { suffix: s } = trimContext("", suffix);
    expect(s).toHaveLength(1000);
    expect(s.startsWith("HEAD")).toBe(true);
  });
});

describe("buildUserPrompt", () => {
  it("embeds prefix and suffix in delimited blocks", () => {
    const prompt = buildUserPrompt({
      prefix: "const a = ",
      suffix: ";",
      language: null,
      filename: null,
    });
    expect(prompt).toContain("PREFIX:\n<<<\nconst a = \n>>>");
    expect(prompt).toContain("SUFFIX:\n<<<\n;\n>>>");
    expect(prompt).not.toContain("File:");
    expect(prompt).not.toContain("Language:");
  });

  it("includes filename and language metadata when present", () => {
    const prompt = buildUserPrompt({
      prefix: "",
      suffix: "",
      language: "ts",
      filename: "main.ts",
    });
    expect(prompt).toContain("File: main.ts");
    expect(prompt).toContain("Language: ts");
  });

  it("includes only the provided metadata line", () => {
    const prompt = buildUserPrompt({
      prefix: "",
      suffix: "",
      language: "go",
      filename: null,
    });
    expect(prompt).toContain("Language: go");
    expect(prompt).not.toContain("File:");
  });
});
