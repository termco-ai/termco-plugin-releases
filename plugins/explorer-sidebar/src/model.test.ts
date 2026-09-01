import { describe, expect, it } from "vitest";
import { dirname, isUnder, joinPath, sortEntries } from "./model";

describe("explorer paths and ordering", () => {
  it("handles POSIX and Windows paths", () => {
    expect(joinPath("/repo/", "/src")).toBe("/repo/src");
    expect(joinPath("C:\\repo", "src")).toBe("C:\\repo\\src");
    expect(dirname("/repo/src/app.ts")).toBe("/repo/src");
    expect(isUnder("/repo/src", "/repo")).toBe(true);
    expect(isUnder("/repository", "/repo")).toBe(false);
  });

  it("keeps folders before symlinks and files", () => {
    const entries = [
      { name: "z.ts", kind: "file" },
      { name: "src", kind: "dir" },
      { name: "link", kind: "symlink" },
    ] as never;
    expect(sortEntries(entries).map((entry) => entry.name)).toEqual(["src", "link", "z.ts"]);
  });
});
