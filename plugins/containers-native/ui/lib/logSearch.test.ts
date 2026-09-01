import { describe, expect, it } from "vitest";
import { formatMatchLines, searchSummary } from "./logSearch";

describe("formatMatchLines", () => {
  it("right-aligns real log line numbers before each match", () => {
    expect(
      formatMatchLines([
        { line: 5, text: "log line 5" },
        { line: 1200, text: "log line 1200" },
      ]),
    ).toBe("   5  log line 5\n1200  log line 1200");
  });

  it("is empty for no matches", () => {
    expect(formatMatchLines([])).toBe("");
  });
});

describe("searchSummary", () => {
  it("shows a spinner label while loading", () => {
    expect(searchSummary(null, true)).toBe("Searching…");
  });

  it("is blank with no result", () => {
    expect(searchSummary(null, false)).toBe("");
  });

  it("counts matches (singular/plural) and marks truncation", () => {
    expect(
      searchSummary(
        { matches: [], matched: 0, scanned: 9, truncated: false },
        false,
      ),
    ).toBe("No matches");
    expect(
      searchSummary(
        { matches: [], matched: 1, scanned: 9, truncated: false },
        false,
      ),
    ).toBe("1 match");
    expect(
      searchSummary(
        { matches: [], matched: 2000, scanned: 9, truncated: true },
        false,
      ),
    ).toBe("2,000+ matches");
  });
});
