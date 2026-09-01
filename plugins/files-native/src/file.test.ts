/**
 * File IO behavior tests (os.tmpdir fixtures).
 */
import {
  chmodSync,
  mkdtempSync,
  readFileSync,
  statSync,
  symlinkSync,
  truncateSync,
  writeFileSync,
} from "node:fs";
import { closeSync, openSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  fsCanonicalize,
  fsReadFile,
  fsStat,
  isMissingFileError,
  writeFilePreservingPerms,
} from "./file";
import "./testRuntime";

const MAX_READ_BYTES = 10 * 1024 * 1024;

const dirs: string[] = [];
function tmp(): string {
  const d = mkdtempSync(join(tmpdir(), "termco-fs-"));
  dirs.push(d);
  return d;
}
afterEach(() => {
  // Temp dirs are left for the OS temp reaper.
});

describe("fs/file", () => {
  it("read_file_classifies_utf8_as_text", () => {
    const f = join(tmp(), "a.txt");
    writeFileSync(f, "hello world");
    const r = fsReadFile(f);
    expect(r.kind).toBe("text");
    if (r.kind === "text") {
      expect(r.content).toBe("hello world");
      expect(r.size).toBe(11);
    }
  });

  it("read_file_detects_binary_via_null_byte", () => {
    const f = join(tmp(), "a.bin");
    writeFileSync(f, Buffer.from([0x50, 0x4e, 0x47, 0x00, 0x89, 0x69, 0x6d]));
    expect(fsReadFile(f).kind).toBe("binary");
  });

  it("read_file_detects_binary_via_invalid_utf8", () => {
    const f = join(tmp(), "a.bin");
    writeFileSync(f, Buffer.from([0xff, 0xfe, 0xfd, 0xfc]));
    expect(fsReadFile(f).kind).toBe("binary");
  });

  it("overwrites_existing_target", () => {
    const target = join(tmp(), "note.txt");
    writeFileSync(target, "old");
    writeFilePreservingPerms(target, Buffer.from("new"));
    expect(readFileSync(target, "utf8")).toBe("new");
  });

  it("read_file_errors_on_missing_path", () => {
    expect(() => fsReadFile(join(tmp(), "nope.txt"))).toThrow();
  });

  it("read_file_reports_too_large_without_reading_body", () => {
    const f = join(tmp(), "huge.bin");
    const fd = openSync(f, "w");
    closeSync(fd);
    truncateSync(f, MAX_READ_BYTES + 1);
    const r = fsReadFile(f);
    expect(r.kind).toBe("toolarge");
    if (r.kind === "toolarge") {
      expect(r.size).toBe(MAX_READ_BYTES + 1);
      expect(r.limit).toBe(MAX_READ_BYTES);
    }
  });

  it("read_file_reads_at_size_cap_boundary", () => {
    const f = join(tmp(), "edge.txt");
    writeFileSync(f, Buffer.alloc(MAX_READ_BYTES, 0x61));
    expect(fsReadFile(f).kind).toBe("text");
  });

  it("write_file_preserving_perms_creates_and_overwrites", () => {
    const target = join(tmp(), "out.txt");
    writeFilePreservingPerms(target, Buffer.from("first"));
    expect(readFileSync(target, "utf8")).toBe("first");
    chmodSync(target, 0o600);
    writeFilePreservingPerms(target, Buffer.from("second"));
    expect(readFileSync(target, "utf8")).toBe("second");
    expect(statSync(target).mode & 0o777).toBe(0o600);
  });

  it("canonicalize_resolves_and_errors_on_missing", () => {
    const d = tmp();
    const f = join(d, "real.txt");
    writeFileSync(f, "x");
    const out = fsCanonicalize(f);
    expect(out.endsWith("real.txt")).toBe(true);
    expect(out.includes("\\")).toBe(false);
    expect(() => fsCanonicalize(join(d, "absent"))).toThrow();
  });

  it("stat_errors_on_missing_path", () => {
    expect(() => fsStat(join(tmp(), "absent"))).toThrow();
  });

  it("stat_classifies_file_and_dir", () => {
    const d = tmp();
    const f = join(d, "a.txt");
    writeFileSync(f, "12345");
    const sf = fsStat(f);
    expect(sf.kind).toBe("file");
    expect(sf.size).toBe(5);
    expect(fsStat(d).kind).toBe("dir");
  });

  it("stat_reports_symlink_kind_with_target_metadata", () => {
    const d = tmp();
    const target = join(d, "real.txt");
    writeFileSync(target, "12345");
    const link = join(d, "link.txt");
    symlinkSync(target, link);
    const s = fsStat(link);
    expect(s.kind).toBe("symlink");
    expect(s.size).toBe(5);
  });

  it("stat_errors_on_broken_symlink", () => {
    const d = tmp();
    const link = join(d, "dangling");
    symlinkSync(join(d, "missing.txt"), link);
    expect(() => fsStat(link)).toThrow();
  });
});

describe("isMissingFileError", () => {
  it("matches a coded local ENOENT", () => {
    let err: unknown;
    try {
      fsReadFile(join(tmp(), "nope.md"));
    } catch (e) {
      err = e;
    }
    expect(isMissingFileError(err)).toBe(true);
  });

  it("matches an ssh RPC error that only carries the message text", () => {
    // The RPC client rebuilds remote errors as `new Error(message)` — the
    // `code` property does not survive the wire.
    expect(
      isMissingFileError(
        new Error("ENOENT: no such file or directory, stat '/home/TERMCO.md'"),
      ),
    ).toBe(true);
  });

  it("rejects unrelated errors", () => {
    expect(isMissingFileError(new Error("EACCES: permission denied"))).toBe(
      false,
    );
    expect(isMissingFileError(null)).toBe(false);
    expect(isMissingFileError("ENOENT")).toBe(false);
  });
});
