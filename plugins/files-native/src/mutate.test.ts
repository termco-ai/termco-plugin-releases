/**
 * Filesystem-mutation behavior tests.
 */
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  statSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { fsCopy, fsCreateDir, fsCreateFile, fsDelete, fsRename } from "./mutate";
import "./testRuntime";

function tmp(): string {
  return mkdtempSync(join(tmpdir(), "termco-mut-"));
}

describe("fs/mutate", () => {
  it("create_file_makes_empty_and_refuses_to_clobber", () => {
    const f = join(tmp(), "new.txt");
    fsCreateFile(f);
    expect(existsSync(f)).toBe(true);
    expect(readFileSync(f, "utf8")).toBe("");
    writeFileSync(f, "data");
    expect(() => fsCreateFile(f)).toThrow(/already exists/);
    expect(readFileSync(f, "utf8")).toBe("data");
  });

  it("create_dir_builds_nested_chain_and_refuses_existing", () => {
    const nested = join(tmp(), "a/b/c");
    fsCreateDir(nested);
    expect(statSync(nested).isDirectory()).toBe(true);
    expect(() => fsCreateDir(nested)).toThrow(/already exists/);
  });

  it("rename_moves_and_never_overwrites", () => {
    const d = tmp();
    const from = join(d, "a.txt");
    const to = join(d, "b.txt");
    writeFileSync(from, "payload");
    fsRename(from, to);
    expect(existsSync(from)).toBe(false);
    expect(readFileSync(to, "utf8")).toBe("payload");
    expect(() => fsRename(from, join(d, "c.txt"))).toThrow(/not found/);
    const occupied = join(d, "keep.txt");
    writeFileSync(occupied, "keep");
    expect(() => fsRename(to, occupied)).toThrow(/already exists/);
    expect(readFileSync(occupied, "utf8")).toBe("keep");
    expect(existsSync(to)).toBe(true);
  });

  it("copy_brings_file_and_dir_in_and_refuses_clobber", () => {
    const src = tmp();
    const dest = tmp();
    writeFileSync(join(src, "a.txt"), "payload");
    mkdirSync(join(src, "d/inner"), { recursive: true });
    writeFileSync(join(src, "d/inner/y.txt"), "y");
    fsCopy([join(src, "a.txt"), join(src, "d")], dest);
    expect(readFileSync(join(dest, "a.txt"), "utf8")).toBe("payload");
    expect(readFileSync(join(dest, "d/inner/y.txt"), "utf8")).toBe("y");
    expect(existsSync(join(src, "a.txt"))).toBe(true);
    expect(() => fsCopy([join(src, "a.txt")], dest)).toThrow(/already exists/);
  });

  it("delete_removes_file_then_dir_recursively", () => {
    const d = tmp();
    const f = join(d, "x.txt");
    writeFileSync(f, "x");
    fsDelete(f);
    expect(existsSync(f)).toBe(false);
    const sub = join(d, "sub");
    mkdirSync(join(sub, "inner"), { recursive: true });
    writeFileSync(join(sub, "inner/y.txt"), "y");
    fsDelete(sub);
    expect(existsSync(sub)).toBe(false);
    expect(() => fsDelete(join(d, "missing"))).toThrow();
  });

  it("create_file_errors_when_parent_missing", () => {
    expect(() => fsCreateFile(join(tmp(), "missing_dir/child.txt"))).toThrow();
  });

  it("create_dir_errors_when_parent_is_a_file", () => {
    const file = join(tmp(), "a");
    writeFileSync(file, "x");
    expect(() => fsCreateDir(join(file, "b"))).toThrow();
  });

  it("rename_errors_when_destination_parent_missing", () => {
    const d = tmp();
    const from = join(d, "a.txt");
    writeFileSync(from, "x");
    expect(() => fsRename(from, join(d, "no_such_dir/b.txt"))).toThrow();
  });

  it("copy_rejects_source_without_filename", () => {
    expect(() => fsCopy(["/"], tmp())).toThrow(/invalid source/);
  });

  it("copy_errors_when_source_missing", () => {
    expect(() => fsCopy([join(tmp(), "ghost.txt")], tmp())).toThrow();
  });

  it("delete_does_not_follow_symlink_into_target", () => {
    const d = tmp();
    const real = join(d, "real");
    mkdirSync(real);
    writeFileSync(join(real, "keep.txt"), "keep");
    const link = join(d, "link");
    symlinkSync(real, link);
    fsDelete(link);
    expect(existsSync(link)).toBe(false);
    expect(statSync(real).isDirectory()).toBe(true);
    expect(readFileSync(join(real, "keep.txt"), "utf8")).toBe("keep");
  });
});
