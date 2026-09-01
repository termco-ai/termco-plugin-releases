import { describe, expect, it } from "vitest";
import { markdownLoadState } from "./model";

describe("Markdown file results", () => {
  it("accepts text and preserves content", () => {
    expect(markdownLoadState({ kind: "text", content: "# Hello", size: 7 })).toEqual({ kind: "ready", content: "# Hello" });
  });

  it("keeps binary and too-large states explicit", () => {
    expect(markdownLoadState({ kind: "binary" })).toEqual({ kind: "binary" });
    expect(markdownLoadState({ kind: "toolarge", size: 20, limit: 10 })).toEqual({ kind: "toolarge", size: 20, limit: 10 });
  });
});
