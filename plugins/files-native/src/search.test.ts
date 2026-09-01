/**
 * fs_list_files / fs_search integration tests (backed by the real ripgrep
 * binary).
 */
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { fsListFiles, fsSearch } from "./search";
import "./testRuntime";

function tmp(): string {
  return mkdtempSync(join(tmpdir(), "termco-search-"));
}

describe("fs/search", () => {
  it("list_files_truncates_at_hit_cap", async () => {
    const d = tmp();
    for (let i = 0; i < 5; i++) writeFileSync(join(d, `f${i}.txt`), "");
    const res = await fsListFiles(d, 2, undefined, undefined, undefined);
    expect(res.files.length).toBe(2);
    expect(res.truncated).toBe(true);
  });

  it("list_files_errors_on_non_directory", async () => {
    await expect(
      fsListFiles("/no/such/dir", undefined, undefined, undefined, undefined),
    ).rejects.toThrow();
  });

  it("search_errors_on_non_directory", async () => {
    await expect(
      fsSearch("/no/such/dir", "x", undefined, undefined, undefined),
    ).rejects.toThrow();
  });

  it("search_returns_empty_for_blank_query", async () => {
    const d = tmp();
    writeFileSync(join(d, "a.txt"), "");
    const res = await fsSearch(d, "   ", undefined, undefined, undefined);
    expect(res.hits).toEqual([]);
  });

  it("search_finds_file_by_fuzzy_name", async () => {
    const d = tmp();
    writeFileSync(join(d, "CommandPalette.tsx"), "");
    writeFileSync(join(d, "readme.md"), "");
    const res = await fsSearch(d, "cmdp", undefined, undefined, undefined);
    expect(res.hits.some((h) => h.name === "CommandPalette.tsx")).toBe(true);
  });
});
