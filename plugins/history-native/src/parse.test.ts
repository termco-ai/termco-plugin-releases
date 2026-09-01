/**
 * History parsing + ranking behavior tests.
 */
import { describe, expect, it } from "vitest";
import {
  buildIndex,
  completeCommands,
  demetafy,
  list,
  parseBash,
  parseFish,
  parseZsh,
  suggest,
} from "./parse";

const META = 0x83;

describe("history/parse", () => {
  it("zsh_extended_and_plain", () => {
    const c = ": 1700000000:0;git status\nls -la\n: 1700000005:2;echo hi;there\n";
    expect(parseZsh(c)).toEqual([
      ["git status", 1700000000],
      ["ls -la", 0],
      ["echo hi;there", 1700000005],
    ]);
  });

  it("zsh_multiline_continuation", () => {
    const c = ": 1:0;for i in 1 2; do\\\necho $i\\\ndone\n";
    const got = parseZsh(c);
    expect(got.length).toBe(1);
    expect(got[0][0]).toContain("for i in 1 2");
    expect(got[0][0]).toContain("echo $i");
  });

  it("bash_with_and_without_timestamps", () => {
    expect(parseBash("#1700000000\ngit push\nls\n")).toEqual([
      ["git push", 1700000000],
      ["ls", 0],
    ]);
  });

  it("fish_format", () => {
    const c = '- cmd: git commit -m \\"x\\"\n  when: 1700000000\n- cmd: ls\n  when: 1700000001\n';
    const got = parseFish(c);
    expect(got.length).toBe(2);
    expect(got[0][1]).toBe(1700000000);
    expect(got[1][0]).toBe("ls");
  });

  it("demetafy_restores_high_bytes", () => {
    const input = Uint8Array.from([0x61, META, 0x41, 0x62]);
    expect([...demetafy(input)]).toEqual([0x61, 0x41 ^ 0x20, 0x62]);
  });

  it("build_index_dedups_and_counts", () => {
    const idx = buildIndex([["ls", 10], ["git st", 20], ["ls", 30]]);
    const ls = idx.find((e) => e.cmd === "ls");
    expect(ls?.count).toBe(2);
    expect(ls?.last).toBe(30);
    expect(idx[0].cmd).toBe("ls");
  });

  it("suggest_picks_most_recent_match", () => {
    const idx = buildIndex([["git status", 10], ["git stash", 99], ["git push", 50]]);
    expect(suggest(idx, "git st")).toBe("git stash");
    expect(suggest(idx, "git status")).toBeNull();
    expect(suggest(idx, "")).toBeNull();
  });

  it("list_filters_by_query_recent_first", () => {
    const idx = buildIndex([["git status", 10], ["npm install", 30], ["git push", 20]]);
    expect(list(idx, "", 10)[0]).toBe("npm install");
    expect(list(idx, "GIT", 10)).toEqual(["git push", "git status"]);
  });

  it("complete_commands_history_then_path", () => {
    const idx = buildIndex([["git status", 10], ["git status", 11], ["grep x", 5]]);
    const got = completeCommands(idx, ["git", "gzip", "grep"], "g", 10);
    expect(got[0]).toBe("git");
    expect(got[1]).toBe("grep");
    expect(got).toContain("gzip");
  });

  it("zsh_non_numeric_timestamp_defaults_to_zero", () => {
    expect(parseZsh(": bad:0;echo hi\n")).toEqual([["echo hi", 0]]);
  });

  it("zsh_extended_prefix_without_semicolon_is_plain", () => {
    expect(parseZsh(": just text\n")).toEqual([[": just text", 0]]);
  });

  it("zsh_trailing_continuation_is_flushed_at_eof", () => {
    expect(parseZsh("echo hi\\")).toEqual([["echo hi", 0]]);
  });

  it("bash_hash_non_timestamp_is_kept_as_command", () => {
    expect(parseBash("#not a ts\nls\n")).toEqual([["#not a ts", 0], ["ls", 0]]);
  });

  it("fish_unescape_sequences_and_pending_flush", () => {
    const c = "- cmd: a\\nb\n- cmd: c\\\\d\n- cmd: back\\\n- cmd: final\n";
    const got = parseFish(c);
    expect(got.length).toBe(4);
    expect(got[0][0]).toBe("a\nb");
    expect(got[1][0]).toBe("c\\d");
    expect(got[2][0]).toBe("back\\");
    expect(got[3][0]).toBe("final");
  });

  it("complete_commands_limit_stops_in_history_scan", () => {
    const idx = buildIndex([["git status", 30], ["grep x", 10]]);
    expect(completeCommands(idx, [], "g", 1)).toEqual(["git"]);
  });

  it("complete_commands_limit_stops_in_path_scan", () => {
    const idx = buildIndex([["zzz", 1]]);
    const got = completeCommands(idx, ["gcc", "gdb"], "g", 1);
    expect(got).toEqual(["gcc"]);
  });
});
