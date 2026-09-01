import type { GitChangedFile, GitStatusSnapshot } from "@termco/git-base";
import { describe, expect, it } from "vitest";
import {
  buildCommitMessagePrompt,
  buildRepairCommitMessagePrompt,
  cleanCommitMessage,
  isValidCommitMessage,
  makeEntry,
  normalizeError,
  optimisticDiscard,
  optimisticStage,
  optimisticUnstage,
  sameSelection,
  statusCodeForMode,
  truncateDiff,
} from "./helpers";
import type { SourceControlEntry } from "./types";

function file(overrides: Partial<GitChangedFile>): GitChangedFile {
  return {
    path: "src/a.ts",
    originalPath: null,
    indexStatus: " ",
    worktreeStatus: "M",
    staged: false,
    unstaged: true,
    untracked: false,
    statusLabel: "Modified",
    ...overrides,
  };
}

function snapshot(changedFiles: GitChangedFile[]): GitStatusSnapshot {
  return {
    repoRoot: "/repo",
    branch: "main",
    upstream: "origin/main",
    ahead: 0,
    behind: 0,
    isDetached: false,
    truncated: false,
    changedFiles,
  };
}

function entryOf(
  path: string,
  overrides: Partial<SourceControlEntry> = {},
): SourceControlEntry {
  return {
    key: `+:${path}`,
    path,
    mode: "+",
    indexStatus: "M",
    worktreeStatus: " ",
    statusLabel: "Modified",
    statusCode: "M",
    originalPath: null,
    untracked: false,
    ...overrides,
  };
}

describe("normalizeError", () => {
  it("handles strings, Errors and fallbacks", () => {
    expect(normalizeError("x")).toBe("x");
    expect(normalizeError(new Error("y"))).toBe("y");
    expect(normalizeError({})).toBe("Unknown source control error");
    expect(normalizeError({ message: 1 })).toBe("Unknown source control error");
  });
});

describe("statusCodeForMode", () => {
  it("returns U for untracked files in unstaged mode", () => {
    const f = file({ untracked: true, worktreeStatus: "?", unstaged: true });
    expect(statusCodeForMode("-", f)).toBe("U");
  });

  it("uses the index status in staged mode", () => {
    const f = file({ indexStatus: "A", worktreeStatus: " " });
    expect(statusCodeForMode("+", f)).toBe("A");
  });

  it("uses the worktree status in unstaged mode", () => {
    const f = file({ indexStatus: " ", worktreeStatus: "D" });
    expect(statusCodeForMode("-", f)).toBe("D");
  });

  it("falls back to the other side when the primary is blank", () => {
    const f = file({ indexStatus: " ", worktreeStatus: "M" });
    expect(statusCodeForMode("+", f)).toBe("M");
    const g = file({ indexStatus: "R", worktreeStatus: " " });
    expect(statusCodeForMode("-", g)).toBe("R");
  });

  it("normalizes ? to U and C to R", () => {
    expect(statusCodeForMode("+", file({ indexStatus: "?" }))).toBe("U");
    expect(statusCodeForMode("+", file({ indexStatus: "C" }))).toBe("R");
    expect(statusCodeForMode("+", file({ indexStatus: "R" }))).toBe("R");
    expect(statusCodeForMode("+", file({ indexStatus: "U" }))).toBe("U");
  });

  it("defaults blank codes to M and lowercases to uppercase", () => {
    expect(
      statusCodeForMode("+", file({ indexStatus: " ", worktreeStatus: " " })),
    ).toBe("M");
    expect(statusCodeForMode("+", file({ indexStatus: "m" }))).toBe("M");
    expect(statusCodeForMode("+", file({ indexStatus: "T" }))).toBe("T");
  });
});

describe("makeEntry", () => {
  it("builds a keyed entry with a normalized status code", () => {
    const f = file({
      path: "src/new.ts",
      originalPath: "src/old.ts",
      indexStatus: "R",
      worktreeStatus: " ",
      staged: true,
      unstaged: false,
      statusLabel: "Renamed",
    });
    expect(makeEntry(f.path, "+", f)).toEqual({
      key: "+:src/new.ts",
      path: "src/new.ts",
      mode: "+",
      indexStatus: "R",
      worktreeStatus: " ",
      statusLabel: "Renamed",
      statusCode: "R",
      originalPath: "src/old.ts",
      untracked: false,
    });
  });
});

describe("sameSelection", () => {
  it("matches only when both path and mode agree", () => {
    expect(
      sameSelection({ path: "a", mode: "+" }, { path: "a", mode: "+" }),
    ).toBe(true);
    expect(
      sameSelection({ path: "a", mode: "+" }, { path: "a", mode: "-" }),
    ).toBe(false);
    expect(
      sameSelection({ path: "a", mode: "+" }, { path: "b", mode: "+" }),
    ).toBe(false);
    expect(sameSelection(null, { path: "a", mode: "+" })).toBe(false);
    expect(sameSelection({ path: "a", mode: "+" }, null)).toBe(false);
    expect(sameSelection(null, null)).toBe(false);
  });
});

describe("truncateDiff", () => {
  it("keeps short diffs intact", () => {
    expect(truncateDiff("small")).toEqual({ text: "small", truncated: false });
  });

  it("truncates diffs above the 60k character limit", () => {
    const long = "x".repeat(60_001);
    const result = truncateDiff(long);
    expect(result.truncated).toBe(true);
    expect(result.text).toHaveLength(60_000);
  });

  it("keeps a diff exactly at the limit", () => {
    const exact = "x".repeat(60_000);
    expect(truncateDiff(exact)).toEqual({ text: exact, truncated: false });
  });
});

describe("cleanCommitMessage", () => {
  it("returns a plain single line unchanged", () => {
    expect(cleanCommitMessage("feat: add thing")).toBe("feat: add thing");
  });

  it("strips code fences", () => {
    expect(cleanCommitMessage("```\nfeat: add thing\n```")).toBe(
      "feat: add thing",
    );
    expect(cleanCommitMessage("```text\nfix: bug\n```")).toBe("fix: bug");
  });

  it("takes the first non-empty line", () => {
    expect(cleanCommitMessage("\n\nfeat: first\nsecond line")).toBe(
      "feat: first",
    );
  });

  it("strips surrounding quotes and backticks", () => {
    expect(cleanCommitMessage('"feat: quoted"')).toBe("feat: quoted");
    expect(cleanCommitMessage("`feat: ticked`")).toBe("feat: ticked");
    expect(cleanCommitMessage("'feat: single'")).toBe("feat: single");
  });

  it("returns empty for blank input", () => {
    expect(cleanCommitMessage("")).toBe("");
    expect(cleanCommitMessage("   \n  ")).toBe("");
  });
});

describe("isValidCommitMessage", () => {
  it("accepts all conventional commit types", () => {
    for (const type of [
      "feat",
      "fix",
      "docs",
      "style",
      "refactor",
      "perf",
      "test",
      "build",
      "ci",
      "chore",
      "revert",
    ]) {
      expect(isValidCommitMessage(`${type}: do something`)).toBe(true);
    }
  });

  it("accepts a scope", () => {
    expect(isValidCommitMessage("feat(source-control): add panel")).toBe(true);
  });

  it("rejects unknown types, missing subjects and empty strings", () => {
    expect(isValidCommitMessage("feature: nope")).toBe(false);
    expect(isValidCommitMessage("feat:")).toBe(false);
    expect(isValidCommitMessage("feat(scope):")).toBe(false);
    expect(isValidCommitMessage("feat(scope)")).toBe(false);
    expect(isValidCommitMessage("just a sentence")).toBe(false);
    expect(isValidCommitMessage("")).toBe(false);
  });
});

describe("buildCommitMessagePrompt", () => {
  it("lists staged files and includes the diff", () => {
    const prompt = buildCommitMessagePrompt(
      [entryOf("src/a.ts"), entryOf("b.ts", { statusCode: "A" })],
      "diff --git a/src/a.ts",
      false,
    );
    expect(prompt).toContain("- M src/a.ts");
    expect(prompt).toContain("- A b.ts");
    expect(prompt).toContain("diff --git a/src/a.ts");
    expect(prompt).toContain("The full staged diff is included below.");
  });

  it("marks renames with the original path", () => {
    const prompt = buildCommitMessagePrompt(
      [entryOf("src/new.ts", { originalPath: "src/old.ts" })],
      "",
      false,
    );
    expect(prompt).toContain("- R src/old.ts -> src/new.ts");
  });

  it("notes truncation and empty diffs", () => {
    const prompt = buildCommitMessagePrompt([entryOf("a.ts")], "", true);
    expect(prompt).toContain("The diff below was truncated");
    expect(prompt).toContain("(No textual diff available.)");
  });
});

describe("buildRepairCommitMessagePrompt", () => {
  it("embeds the invalid line and staged files", () => {
    const prompt = buildRepairCommitMessagePrompt("feat(", [entryOf("a.ts")]);
    expect(prompt).toContain("Invalid line: feat(");
    expect(prompt).toContain("- M a.ts");
  });

  it("labels an empty invalid line", () => {
    expect(buildRepairCommitMessagePrompt("", [])).toContain(
      "Invalid line: (empty)",
    );
  });
});

describe("optimisticStage", () => {
  it("moves the worktree status into the index", () => {
    const status = snapshot([
      file({ path: "a.ts", worktreeStatus: "M", unstaged: true }),
    ]);
    const next = optimisticStage(status, new Set(["a.ts"]));
    expect(next).not.toBe(status);
    expect(next.changedFiles[0]).toMatchObject({
      indexStatus: "M",
      worktreeStatus: " ",
      staged: true,
      unstaged: false,
      untracked: false,
    });
  });

  it("keeps the index status when the worktree side is blank", () => {
    const status = snapshot([
      file({
        path: "a.ts",
        indexStatus: "A",
        worktreeStatus: " ",
        staged: true,
        unstaged: true,
      }),
    ]);
    const next = optimisticStage(status, new Set(["a.ts"]));
    expect(next.changedFiles[0].indexStatus).toBe("A");
  });

  it("returns the same snapshot when nothing changes", () => {
    const staged = snapshot([
      file({
        path: "a.ts",
        indexStatus: "M",
        worktreeStatus: " ",
        staged: true,
        unstaged: false,
      }),
    ]);
    expect(optimisticStage(staged, new Set(["a.ts"]))).toBe(staged);
    expect(optimisticStage(staged, new Set(["other.ts"]))).toBe(staged);
  });

  it("leaves unrelated files untouched", () => {
    const other = file({ path: "b.ts" });
    const status = snapshot([file({ path: "a.ts" }), other]);
    const next = optimisticStage(status, new Set(["a.ts"]));
    expect(next.changedFiles[1]).toBe(other);
  });
});

describe("optimisticUnstage", () => {
  it("moves the index status back to the worktree", () => {
    const status = snapshot([
      file({
        path: "a.ts",
        indexStatus: "M",
        worktreeStatus: " ",
        staged: true,
        unstaged: false,
      }),
    ]);
    const next = optimisticUnstage(status, new Set(["a.ts"]));
    expect(next.changedFiles[0]).toMatchObject({
      indexStatus: " ",
      worktreeStatus: "M",
      staged: false,
      unstaged: true,
      untracked: false,
    });
  });

  it("turns staged additions back into untracked files", () => {
    const status = snapshot([
      file({
        path: "new.ts",
        indexStatus: "A",
        worktreeStatus: " ",
        staged: true,
        unstaged: false,
      }),
    ]);
    const next = optimisticUnstage(status, new Set(["new.ts"]));
    expect(next.changedFiles[0]).toMatchObject({
      worktreeStatus: "?",
      untracked: true,
      unstaged: true,
    });
  });

  it("splits a staged rename into a deletion and an untracked file", () => {
    const status = snapshot([
      file({
        path: "src/new.ts",
        originalPath: "src/old.ts",
        indexStatus: "R",
        worktreeStatus: " ",
        staged: true,
        unstaged: false,
        statusLabel: "Renamed",
      }),
    ]);
    const next = optimisticUnstage(status, new Set(["src/new.ts"]));
    expect(next.changedFiles).toHaveLength(2);
    expect(next.changedFiles[0]).toEqual({
      path: "src/old.ts",
      originalPath: null,
      indexStatus: " ",
      worktreeStatus: "D",
      staged: false,
      unstaged: true,
      untracked: false,
      statusLabel: "Deleted",
    });
    expect(next.changedFiles[1]).toEqual({
      path: "src/new.ts",
      originalPath: null,
      indexStatus: " ",
      worktreeStatus: "?",
      staged: false,
      unstaged: true,
      untracked: true,
      statusLabel: "Untracked",
    });
  });

  it("returns the same snapshot when nothing is staged", () => {
    const status = snapshot([
      file({ path: "a.ts", staged: false, unstaged: true }),
    ]);
    expect(optimisticUnstage(status, new Set(["a.ts"]))).toBe(status);
  });
});

describe("optimisticDiscard", () => {
  it("removes purely unstaged files", () => {
    const status = snapshot([
      file({ path: "a.ts", staged: false, unstaged: true }),
      file({ path: "b.ts", staged: false, unstaged: true }),
    ]);
    const next = optimisticDiscard(status, new Set(["a.ts"]));
    expect(next.changedFiles.map((f) => f.path)).toEqual(["b.ts"]);
  });

  it("keeps the staged side of partially staged files", () => {
    const status = snapshot([
      file({
        path: "a.ts",
        indexStatus: "M",
        worktreeStatus: "M",
        staged: true,
        unstaged: true,
      }),
    ]);
    const next = optimisticDiscard(status, new Set(["a.ts"]));
    expect(next.changedFiles[0]).toMatchObject({
      staged: true,
      worktreeStatus: " ",
      unstaged: false,
      untracked: false,
    });
  });

  it("returns the same snapshot when no path matches", () => {
    const status = snapshot([file({ path: "a.ts" })]);
    expect(optimisticDiscard(status, new Set(["other.ts"]))).toBe(status);
  });
});
