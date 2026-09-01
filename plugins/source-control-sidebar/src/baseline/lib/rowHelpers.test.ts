import { describe, expect, it } from "vitest";
import type { SourceControlFileEntry } from "../useSourceControlPanel";
import {
  basename,
  checkboxValue,
  dirname,
  entryPathLabel,
  statusAccent,
  upstreamBadgeLabel,
} from "./rowHelpers";

function entry(
  overrides: Partial<SourceControlFileEntry>,
): SourceControlFileEntry {
  return {
    key: "src/a.ts",
    path: "src/a.ts",
    originalPath: null,
    statusCode: "M",
    statusLabel: "Modified",
    checkState: "unchecked",
    staged: false,
    unstaged: true,
    untracked: false,
    ...overrides,
  };
}

describe("basename", () => {
  it("returns the last segment of a unix path", () => {
    expect(basename("src/modules/a.ts")).toBe("a.ts");
  });

  it("handles Windows backslashes", () => {
    expect(basename("src\\modules\\a.ts")).toBe("a.ts");
  });

  it("handles mixed separators and trailing slashes", () => {
    expect(basename("src\\modules/a.ts")).toBe("a.ts");
    expect(basename("src/modules/")).toBe("modules");
  });

  it("returns the input when there is no segment", () => {
    expect(basename("a.ts")).toBe("a.ts");
    expect(basename("")).toBe("");
  });
});

describe("dirname", () => {
  it("returns the parent directory", () => {
    expect(dirname("src/modules/a.ts")).toBe("src/modules");
  });

  it("normalizes backslashes", () => {
    expect(dirname("src\\modules\\a.ts")).toBe("src/modules");
  });

  it("returns empty for top-level and rootless paths", () => {
    expect(dirname("a.ts")).toBe("");
    expect(dirname("/a.ts")).toBe("");
  });
});

describe("entryPathLabel", () => {
  it("shows the rename arrow when originalPath is set", () => {
    expect(
      entryPathLabel(entry({ originalPath: "src/old.ts", path: "src/new.ts" })),
    ).toBe("src/old.ts → src/new.ts");
  });

  it("falls back to the directory name", () => {
    expect(entryPathLabel(entry({ path: "src/deep/a.ts" }))).toBe("src/deep");
  });

  it("is empty for top-level files", () => {
    expect(entryPathLabel(entry({ path: "a.ts" }))).toBe("");
  });
});

describe("upstreamBadgeLabel", () => {
  it("returns the upstream when present", () => {
    expect(upstreamBadgeLabel("origin/main")).toBe("origin/main");
  });

  it("falls back for null, undefined and empty", () => {
    expect(upstreamBadgeLabel(null)).toBe("No upstream");
    expect(upstreamBadgeLabel(undefined)).toBe("No upstream");
    expect(upstreamBadgeLabel("")).toBe("No upstream");
  });
});

describe("statusAccent", () => {
  it("maps known status codes to accent classes", () => {
    expect(statusAccent("A")).toBe("bg-emerald-500/85");
    expect(statusAccent("U")).toBe("bg-teal-500/85");
    expect(statusAccent("M")).toBe("bg-amber-500/85");
    expect(statusAccent("D")).toBe("bg-rose-500/85");
    expect(statusAccent("R")).toBe("bg-sky-500/85");
  });

  it("falls back for unknown codes", () => {
    expect(statusAccent("X")).toBe("bg-muted-foreground/40");
    expect(statusAccent("")).toBe("bg-muted-foreground/40");
  });
});

describe("checkboxValue", () => {
  it("maps check states to checkbox values", () => {
    expect(checkboxValue("checked")).toBe(true);
    expect(checkboxValue("indeterminate")).toBe("indeterminate");
    expect(checkboxValue("unchecked")).toBe(false);
  });
});
