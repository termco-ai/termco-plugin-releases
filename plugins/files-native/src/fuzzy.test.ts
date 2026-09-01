/**
 * rankFuzzy behavior tests.
 */
import { describe, expect, it } from "vitest";
import { rankFuzzy, type Scorable } from "./fuzzy";

const hit = (rel: string): Scorable => ({ rel });

describe("rankFuzzy", () => {
  it("rank_fuzzy_prefers_name_and_shorter_path", () => {
    const out = rankFuzzy(
      [hit("src/deeply/nested/config.rs"), hit("config.rs"), hit("src/main.rs")],
      "config",
      10,
    );
    expect(out[0].rel).toBe("config.rs");
    expect(out.some((h) => h.rel === "src/main.rs")).toBe(false);
  });

  it("rank_fuzzy_matches_subsequence", () => {
    const out = rankFuzzy([hit("CommandPalette.tsx"), hit("readme.md")], "cmdp", 10);
    expect(out.length).toBe(1);
    expect(out[0].rel).toBe("CommandPalette.tsx");
  });
});
