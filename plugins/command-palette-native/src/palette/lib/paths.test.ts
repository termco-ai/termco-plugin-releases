import { describe, expect, it } from "vitest";
import { basename } from "./paths";

describe("basename", () => {
  it("returns the final segment of a unix path", () => {
    expect(basename("src/lib/utils.ts")).toBe("utils.ts");
  });

  it("tolerates backslash separators", () => {
    expect(basename("src\\lib\\utils.ts")).toBe("utils.ts");
  });

  it("tolerates mixed separators", () => {
    expect(basename("src\\lib/utils.ts")).toBe("utils.ts");
  });

  it("returns the input when there is no separator", () => {
    expect(basename("README.md")).toBe("README.md");
  });

  it("falls back to the input for a trailing separator", () => {
    expect(basename("src/")).toBe("src/");
  });
});
