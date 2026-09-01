/**
 * Pure-function tests for the stage/commit/branch/remote helpers.
 */
import { describe, expect, it } from "vitest";
import type { GitOutput } from "./runner";
import {
  applyNumstat,
  isRemoteNameChar,
  looksLikeNoHead,
  nothingToCommit,
  parseDiffTreeNameStatus,
  pushWorktree,
  splitUpstream,
  statusLabelFor,
  type GitBranchEntry,
} from "./operations";

const mk = (stdout: string, stderr: string, exit: number): GitOutput => ({
  stdout: Buffer.from(stdout),
  stderr: Buffer.from(stderr),
  exitCode: exit,
  timedOut: false,
  truncated: false,
});

describe("stage helpers", () => {
  it("looks_like_no_head_recognizes_phrases", () => {
    expect(looksLikeNoHead(mk("", "fatal: ambiguous argument 'HEAD': unknown revision", 128))).toBe(true);
    expect(looksLikeNoHead(mk("", "fatal: your current branch 'main' does not have any commits yet", 128))).toBe(true);
    expect(looksLikeNoHead(mk("", "fatal: pathspec did not match", 128))).toBe(false);
  });
});

describe("commit helpers", () => {
  it("status_label_for_known_and_unknown", () => {
    expect(statusLabelFor("A")).toBe("Added");
    expect(statusLabelFor("M")).toBe("Modified");
    expect(statusLabelFor("D")).toBe("Deleted");
    expect(statusLabelFor("R")).toBe("Renamed");
    expect(statusLabelFor("C")).toBe("Copied");
    expect(statusLabelFor("X")).toBe("Status X");
  });

  it("parse_name_status_handles_simple_statuses", () => {
    const files = parseDiffTreeNameStatus(Buffer.from("A\0new.txt\0M\0mod.txt\0"));
    expect(files.length).toBe(2);
    expect(files[0].path).toBe("new.txt");
    expect(files[0].status).toBe("A");
    expect(files[0].statusLabel).toBe("Added");
    expect(files[0].originalPath).toBeNull();
    expect(files[1].path).toBe("mod.txt");
    expect(files[1].status).toBe("M");
  });

  it("parse_name_status_pairs_rename_paths", () => {
    const files = parseDiffTreeNameStatus(Buffer.from("R100\0old.txt\0new.txt\0"));
    expect(files.length).toBe(1);
    expect(files[0].path).toBe("new.txt");
    expect(files[0].originalPath).toBe("old.txt");
    expect(files[0].status).toBe("R");
    expect(files[0].statusLabel).toBe("Renamed");
  });

  it("apply_numstat_sets_counts_for_inline_paths", () => {
    const files = parseDiffTreeNameStatus(Buffer.from("M\0a.txt\0"));
    applyNumstat(files, Buffer.from("3\t1\ta.txt\0"));
    expect(files[0].added).toBe(3);
    expect(files[0].removed).toBe(1);
    expect(files[0].isBinary).toBe(false);
  });

  it("apply_numstat_marks_binary_dashes", () => {
    const files = parseDiffTreeNameStatus(Buffer.from("M\0blob.bin\0"));
    applyNumstat(files, Buffer.from("-\t-\tblob.bin\0"));
    expect(files[0].isBinary).toBe(true);
    expect(files[0].added).toBe(0);
    expect(files[0].removed).toBe(0);
  });

  it("apply_numstat_consumes_rename_path_pair", () => {
    const files = parseDiffTreeNameStatus(Buffer.from("R100\0old.txt\0new.txt\0"));
    applyNumstat(files, Buffer.from("5\t2\t\0old.txt\0new.txt\0"));
    expect(files[0].added).toBe(5);
    expect(files[0].removed).toBe(2);
    expect(files[0].originalPath).toBe("old.txt");
  });

  it("parse_name_status_keeps_tab_containing_paths_intact", () => {
    const files = parseDiffTreeNameStatus(Buffer.from("R100\0a\tb.txt\0new.txt\0M\0plain.txt\0"));
    expect(files.length).toBe(2);
    expect(files[0].path).toBe("new.txt");
    expect(files[0].originalPath).toBe("a\tb.txt");
    expect(files[1].path).toBe("plain.txt");
  });

  it("apply_numstat_handles_tab_containing_rename_paths", () => {
    const files = parseDiffTreeNameStatus(Buffer.from("R100\0a\tb.txt\0new.txt\0"));
    applyNumstat(files, Buffer.from("5\t2\t\0a\tb.txt\0new.txt\0"));
    expect(files.length).toBe(1);
    expect(files[0].added).toBe(5);
    expect(files[0].removed).toBe(2);
    expect(files[0].originalPath).toBe("a\tb.txt");
  });

  it("apply_numstat_ignores_unknown_paths", () => {
    const files = parseDiffTreeNameStatus(Buffer.from("M\0a.txt\0"));
    applyNumstat(files, Buffer.from("3\t1\tother.txt\0"));
    expect(files[0].added).toBe(0);
    expect(files[0].removed).toBe(0);
  });

  it("nothing_to_commit_scans_both_streams", () => {
    expect(nothingToCommit(mk("On branch main\nnothing to commit, working tree clean\n", "", 1))).toBe(true);
    expect(nothingToCommit(mk("", "Nothing to commit", 1))).toBe(true);
    expect(nothingToCommit(mk("committed", "", 1))).toBe(false);
  });
});

describe("branch helpers", () => {
  it("push_worktree_uses_branch_name_when_present", () => {
    const v: GitBranchEntry[] = [];
    pushWorktree(v, "/wt/feature", "feature", "abcdef1234567");
    expect(v.length).toBe(1);
    expect(v[0].name).toBe("feature");
    expect(v[0].kind).toBe("worktree");
    expect(v[0].worktreePath).toBe("/wt/feature");
    expect(v[0].isHead).toBe(false);
    expect(v[0].isDetached).toBe(false);
  });

  it("push_worktree_labels_detached_head_with_short_sha", () => {
    const v: GitBranchEntry[] = [];
    pushWorktree(v, "/wt/x", null, "0123456789abcdef");
    expect(v[0].name).toBe("(detached @ 0123456)");
    expect(v[0].isDetached).toBe(true);
  });

  it("push_worktree_keeps_short_sha_whole", () => {
    const v: GitBranchEntry[] = [];
    pushWorktree(v, "/wt/x", null, "abc");
    expect(v[0].name).toBe("(detached @ abc)");
  });

  it("push_worktree_skips_entries_without_branch_or_sha", () => {
    const v: GitBranchEntry[] = [];
    pushWorktree(v, "/wt/x", null, null);
    expect(v.length).toBe(0);
  });
});

describe("remote + utils helpers", () => {
  it("is_remote_name_char_allows_word_and_punct", () => {
    for (const c of "abcXYZ012-_.") expect(isRemoteNameChar(c)).toBe(true);
    for (const c of " /:\\?\"'") expect(isRemoteNameChar(c)).toBe(false);
  });

  it("split_upstream", () => {
    expect(splitUpstream("origin/main")).toEqual(["origin", "main"]);
    expect(splitUpstream("localbranch")).toEqual([null, "localbranch"]);
  });
});
