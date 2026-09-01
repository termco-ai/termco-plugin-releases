import { describe, expect, it } from "vitest";
import { basename, contentHits } from "./search";

describe("workspace search result boundary", () => {
  it("accepts valid hits and rejects malformed provider data", () => {
    expect(contentHits({ hits: [
      { path: "/repo/src/a.ts", rel: "src/a.ts", line: 3, text: "const a = 1" },
      { path: 42, rel: "broken", line: 1, text: "no" },
    ] })).toEqual([
      { path: "/repo/src/a.ts", rel: "src/a.ts", line: 3, text: "const a = 1" },
    ]);
  });

  it("renders portable file basenames", () => {
    expect(basename("src/features/search.ts")).toBe("search.ts");
    expect(basename("src\\features\\search.ts")).toBe("search.ts");
  });
});
