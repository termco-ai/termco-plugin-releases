/**
 * History-state helper tests.
 */
import { chmodSync, mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { HistEntry } from "./parse";
import {
  fishHistfile,
  HistoryState,
  readHistoriesFrom,
  scanDirs,
  zshHistfile,
} from "./state";

function tmp(): string {
  return mkdtempSync(join(tmpdir(), "termco-hist-"));
}
const entry = (cmd: string, count: number, last: number): HistEntry => ({ cmd, count, last });
const seeded = (entries: HistEntry[], pathCmds: string[]) =>
  new HistoryState(() => ({ entries, pathCmds }));

describe("history/state", () => {
  it("zsh_histfile_prefers_existing_env_file_then_home", () => {
    const dir = tmp();
    const explicit = join(dir, "custom_zsh");
    writeFileSync(explicit, "");
    expect(zshHistfile(dir, explicit)).toBe(explicit);
    expect(zshHistfile(dir, join(dir, "nope"))).toBe(join(dir, ".zsh_history"));
    expect(zshHistfile(dir, null)).toBe(join(dir, ".zsh_history"));
    expect(zshHistfile(null, null)).toBeNull();
  });

  it("fish_histfile_prefers_existing_xdg_then_home", () => {
    const dir = tmp();
    const xdg = join(dir, "xdg");
    mkdirSync(join(xdg, "fish"), { recursive: true });
    writeFileSync(join(xdg, "fish", "fish_history"), "");
    expect(fishHistfile(dir, xdg)).toBe(join(xdg, "fish/fish_history"));
    expect(fishHistfile(dir, join(dir, "empty"))).toBe(join(dir, ".local/share/fish/fish_history"));
    expect(fishHistfile(dir, null)).toBe(join(dir, ".local/share/fish/fish_history"));
    expect(fishHistfile(null, null)).toBeNull();
  });

  it("read_histories_from_merges_all_three_shells", () => {
    const home = tmp();
    writeFileSync(join(home, ".zsh_history"), ": 100:0;zcmd\n");
    writeFileSync(join(home, ".bash_history"), "#200\nbcmd\n");
    mkdirSync(join(home, ".local/share/fish"), { recursive: true });
    writeFileSync(join(home, ".local/share/fish/fish_history"), "- cmd: fcmd\n  when: 300\n");
    const got = readHistoriesFrom(home, null, null);
    expect(got).toContainEqual(["zcmd", 100]);
    expect(got).toContainEqual(["bcmd", 200]);
    expect(got).toContainEqual(["fcmd", 300]);
  });

  it("read_histories_from_tolerates_missing_files_and_no_home", () => {
    expect(readHistoriesFrom(tmp(), null, null)).toEqual([]);
    expect(readHistoriesFrom(null, null, null)).toEqual([]);
  });

  it("read_histories_from_reads_explicit_env_locations", () => {
    const dir = tmp();
    const zsh = join(dir, "z");
    writeFileSync(zsh, ": 5:0;envzsh\n");
    const xdg = join(dir, "xdg");
    mkdirSync(join(xdg, "fish"), { recursive: true });
    writeFileSync(join(xdg, "fish/fish_history"), "- cmd: envfish\n  when: 6\n");
    const got = readHistoriesFrom(null, zsh, xdg);
    expect(got).toContainEqual(["envzsh", 5]);
    expect(got).toContainEqual(["envfish", 6]);
  });

  it("scan_dirs_collects_sorted_executables_only", () => {
    const dir = tmp();
    for (const name of ["zed", "apple"]) {
      const p = join(dir, name);
      writeFileSync(p, "#!/bin/sh\n");
      chmodSync(p, 0o755);
    }
    const plain = join(dir, "notes.txt");
    writeFileSync(plain, "x");
    chmodSync(plain, 0o644);
    mkdirSync(join(dir, "subdir"));
    const got = scanDirs([dir, join(dir, "does-not-exist")]);
    expect(got).toEqual(["apple", "zed"]);
  });

  it("suggest_impl_completes_from_seeded_index", () => {
    const state = seeded([entry("git status", 1, 10), entry("git stash", 1, 99)], []);
    expect(state.suggest("git st")).toBe("git stash");
    expect(state.suggest("")).toBeNull();
  });

  it("commands_impl_uses_history_and_path", () => {
    const state = seeded([entry("git status", 2, 10)], ["gzip"]);
    const got = state.commands("g");
    expect(got[0]).toBe("git");
    expect(got).toContain("gzip");
  });

  it("list_impl_filters_and_limits", () => {
    const state = seeded([entry("git push", 1, 20), entry("npm install", 1, 30)], []);
    expect(state.list("git")).toEqual(["git push"]);
    expect(state.list("", 1).length).toBe(1);
  });

  it("record_impl_inserts_new_and_bumps_existing", () => {
    const state = seeded([entry("ls", 1, 5)], []);
    state.record("   ");
    state.record("make build");
    state.record("ls");
    expect(state.list("ls")[0]).toBe("ls");
    // "ls" bumped to count 2 and sorted to front
    expect(state.list("", 10)[0]).toBe("ls");
  });
});
