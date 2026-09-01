/**
 * Pathspec resolution behavior tests.
 */
import { mkdirSync, mkdtempSync, realpathSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { pathspec, pathspecFromInput, resolvePathspecs } from "./pathspec";

describe("pathspec", () => {
  it("pathspec_strips_repo_prefix_with_forward_slashes", () => {
    // Use a real dir so realpath in pathspec() resolves cleanly.
    const root = realpathSync(mkdtempSync(join(tmpdir(), "termco-ps-")));
    mkdirSync(join(root, "src"));
    writeFileSync(join(root, "src", "main.rs"), "x");
    expect(pathspec(root, join(root, "src", "main.rs"))).toBe("src/main.rs");
  });

  it("pathspec_from_input_resolves_existing_file", () => {
    const root = realpathSync(mkdtempSync(join(tmpdir(), "termco-ps-")));
    mkdirSync(join(root, "sub"));
    writeFileSync(join(root, "sub", "file.txt"), "x");
    expect(pathspecFromInput(root, "sub/file.txt")).toBe("sub/file.txt");
  });

  it("pathspec_from_input_rejects_traversal", () => {
    const root = realpathSync(mkdtempSync(join(tmpdir(), "termco-ps-")));
    expect(() => pathspecFromInput(root, "../escape.txt")).toThrow();
  });

  it("resolve_pathspecs_maps_every_entry", () => {
    const root = realpathSync(mkdtempSync(join(tmpdir(), "termco-ps-")));
    writeFileSync(join(root, "a.txt"), "a");
    writeFileSync(join(root, "b.txt"), "b");
    expect(resolvePathspecs(root, ["a.txt", "b.txt"])).toEqual(["a.txt", "b.txt"]);
  });

  it("resolve_pathspecs_fails_fast_on_bad_entry", () => {
    const root = realpathSync(mkdtempSync(join(tmpdir(), "termco-ps-")));
    writeFileSync(join(root, "a.txt"), "a");
    expect(() => resolvePathspecs(root, ["a.txt", "../out"])).toThrow();
  });
});
