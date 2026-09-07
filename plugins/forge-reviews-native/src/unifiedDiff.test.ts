// @vitest-environment node
import { describe, expect, it } from "vitest";
import { parseUnifiedDiff } from "./unifiedDiff";

describe("parseUnifiedDiff", () => {
  it("counts increment and decrement lines inside hunks as changes", () => {
    const [file] = parseUnifiedDiff([
      "diff --git a/count.ts b/count.ts",
      "--- a/count.ts",
      "+++ b/count.ts",
      "@@ -1 +1 @@",
      "---counter;",
      "+++counter;",
    ].join("\n"));
    expect(file).toMatchObject({ path: "count.ts", additions: 1, deletions: 1 });
  });

  it("normalizes added, renamed, and binary files with exact statistics", () => {
    const files = parseUnifiedDiff(
      [
        "diff --git a/src/new.ts b/src/new.ts",
        "new file mode 100644",
        "--- /dev/null",
        "+++ b/src/new.ts",
        "@@ -0,0 +1,2 @@",
        "+one",
        "+two",
        "diff --git a/old.ts b/new-name.ts",
        "similarity index 90%",
        "rename from old.ts",
        "rename to new-name.ts",
        "--- a/old.ts",
        "+++ b/new-name.ts",
        "@@ -1 +1 @@",
        "-old",
        "+new",
        "diff --git a/logo.png b/logo.png",
        "Binary files a/logo.png and b/logo.png differ",
      ].join("\n"),
    );

    expect(files).toEqual([
      expect.objectContaining({ path: "src/new.ts", status: "added", additions: 2, deletions: 0 }),
      expect.objectContaining({
        path: "new-name.ts",
        previousPath: "old.ts",
        status: "renamed",
        additions: 1,
        deletions: 1,
      }),
      expect.objectContaining({ path: "logo.png", status: "binary", additions: 0, deletions: 0 }),
    ]);
  });
});

it("decodes Git octal UTF-8 and C escapes in headers, renames, and binary paths", () => {
  const quoted = String.raw`caf\303\251\t\"\\.ts`;
  const decoded = 'café\t"\\.ts';
  expect(parseUnifiedDiff([
    `diff --git "a/${quoted}" "b/${quoted}"`,
    `--- "a/${quoted}"`, `+++ "b/${quoted}"`,
    "@@ -1 +1 @@", "-a", "+b",
  ].join("\n"))[0].path).toBe(decoded);
  expect(parseUnifiedDiff([
    `diff --git a/old.ts "b/${quoted}"`,
    'rename from "old\\t.ts"', `rename to "${quoted}"`,
  ].join("\n"))[0]).toMatchObject({ path: decoded, previousPath: "old\t.ts" });
  expect(parseUnifiedDiff([
    `diff --git "a/${quoted}" "b/${quoted}"`, "GIT binary patch",
  ].join("\n"))[0].path).toBe(decoded);
});
