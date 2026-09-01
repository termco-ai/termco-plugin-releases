/**
 * Porcelain-v2 parser behavior tests.
 */
import { describe, expect, it } from "vitest";
import { parsePorcelainV2 } from "./parser";

const ordinary = (xy: string, path: string) =>
  `1 ${xy} N... 100644 100644 100644 aaaa bbbb ${path}\0`;

describe("parsePorcelainV2", () => {
  it("porcelain_v2_parses_branch_and_files", () => {
    const stdout =
      "# branch.oid abc123\0" +
      "# branch.head main\0" +
      "# branch.upstream origin/main\0" +
      "# branch.ab +2 -1\0" +
      "1 .M N... 100644 100644 100644 abc def src/a.rs\0" +
      "2 R. N... 100644 100644 100644 abc def R100 src/new.rs\0src/old.rs\0" +
      "? src/untracked.rs\0";
    const p = parsePorcelainV2(stdout);
    expect(p.branch).toBe("main");
    expect(p.upstream).toBe("origin/main");
    expect(p.ahead).toBe(2);
    expect(p.behind).toBe(1);
    expect(p.isDetached).toBe(false);
    expect(p.files.length).toBe(3);
    expect(p.files[0].path).toBe("src/a.rs");
    expect(p.files[0].unstaged).toBe(true);
    expect(p.files[1].path).toBe("src/new.rs");
    expect(p.files[1].originalPath).toBe("src/old.rs");
    expect(p.files[1].staged).toBe(true);
    expect(p.files[2].path).toBe("src/untracked.rs");
    expect(p.files[2].untracked).toBe(true);
  });

  it("handles_detached_head", () => {
    const p = parsePorcelainV2("# branch.oid abc\0# branch.head (detached)\0");
    expect(p.isDetached).toBe(true);
    expect(p.branch).toBe("(detached)");
    expect(p.upstream).toBeNull();
  });

  it("empty_input_yields_safe_defaults", () => {
    const p = parsePorcelainV2("");
    expect(p.branch).toBe("HEAD");
    expect(p.files).toEqual([]);
    expect(p.ahead).toBe(0);
    expect(p.behind).toBe(0);
    expect(p.isDetached).toBe(false);
    expect(p.upstream).toBeNull();
  });

  it("preserves_paths_with_spaces", () => {
    const p = parsePorcelainV2(ordinary(".M", "src/my file name.rs"));
    expect(p.files.length).toBe(1);
    expect(p.files[0].path).toBe("src/my file name.rs");
  });

  it("rename_consumes_orig_token_without_eating_next_entry", () => {
    const stdout =
      "2 R. N... 100644 100644 100644 abc def R100 new.rs\0old.rs\0" +
      ordinary(".M", "after.rs");
    const p = parsePorcelainV2(stdout);
    expect(p.files.length).toBe(2);
    expect(p.files[0].path).toBe("new.rs");
    expect(p.files[0].originalPath).toBe("old.rs");
    expect(p.files[0].statusLabel).toBe("Renamed");
    expect(p.files[1].path).toBe("after.rs");
    expect(p.files[1].originalPath).toBeNull();
  });

  it("unmerged_entry_parsed_and_labeled", () => {
    const p = parsePorcelainV2(
      "u UU N... 100644 100644 100644 100644 a b c conflict.rs\0",
    );
    expect(p.files.length).toBe(1);
    const f = p.files[0];
    expect(f.path).toBe("conflict.rs");
    expect(f.statusLabel).toBe("Unmerged");
    expect(f.staged).toBe(true);
    expect(f.unstaged).toBe(true);
  });

  it("staged_unstaged_untracked_matrix", () => {
    const cases: [string, boolean, boolean, boolean, string][] = [
      [".M", false, true, false, "Modified"],
      ["M.", true, false, false, "Modified"],
      ["MM", true, true, false, "Modified"],
      ["A.", true, false, false, "Added"],
      ["D.", true, false, false, "Deleted"],
      [".D", false, true, false, "Deleted"],
    ];
    for (const [xy, staged, unstaged, untracked, label] of cases) {
      const f = parsePorcelainV2(ordinary(xy, "f.rs")).files[0];
      expect(f.staged).toBe(staged);
      expect(f.unstaged).toBe(unstaged);
      expect(f.untracked).toBe(untracked);
      expect(f.statusLabel).toBe(label);
    }
  });

  it("untracked_is_unstaged_but_not_staged", () => {
    const f = parsePorcelainV2("? new.rs\0").files[0];
    expect(f.untracked).toBe(true);
    expect(f.staged).toBe(false);
    expect(f.unstaged).toBe(true);
    expect(f.statusLabel).toBe("Untracked");
    expect(f.indexStatus).toBe("?");
    expect(f.worktreeStatus).toBe("?");
  });

  it("malformed_entries_are_skipped_without_panic", () => {
    const p = parsePorcelainV2("1 \0" + ordinary(".M", "ok.rs"));
    expect(p.files.some((f) => f.path === "ok.rs")).toBe(true);
  });
});
