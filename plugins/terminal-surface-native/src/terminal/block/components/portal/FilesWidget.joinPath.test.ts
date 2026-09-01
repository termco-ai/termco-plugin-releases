import { describe, expect, it } from "vitest";
import { joinPath } from "./FilesWidget";

describe("FilesWidget joinPath", () => {
  it("never returns an empty path for a root/empty cwd", () => {
    expect(joinPath("/", ".")).toBe("/");
    expect(joinPath("//", ".")).toBe("/");
    expect(joinPath("/", ".")).not.toBe("");
  });

  it("joins normal cwds and relative targets", () => {
    expect(joinPath("/Users/x", ".")).toBe("/Users/x");
    expect(joinPath("/Users/x/", ".")).toBe("/Users/x");
    expect(joinPath("/Users/x", "sub")).toBe("/Users/x/sub");
    expect(joinPath("/Users/x", "./sub")).toBe("/Users/x/sub");
    expect(joinPath("/Users/x", "/abs")).toBe("/abs");
    expect(joinPath("/", "sub")).toBe("/sub");
  });
});
