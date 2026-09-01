import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AnyPart } from "./fileMutations";
import {
  applyEditsLocally,
  extractFileMutation,
  readOriginal,
} from "./fileMutations";

const { readFileMock } = vi.hoisted(() => ({ readFileMock: vi.fn() }));

vi.mock("../../lib/native", () => ({
  native: { readFile: readFileMock },
}));

function part(obj: Record<string, unknown>): AnyPart {
  return obj as unknown as AnyPart;
}

describe("extractFileMutation", () => {
  it("returns null for non-mutation parts", () => {
    expect(extractFileMutation(part({ type: "text", text: "x" }))).toBeNull();
    expect(
      extractFileMutation(part({ type: "tool-read_file", input: {} })),
    ).toBeNull();
  });

  it("parses a write_file part into a literal derivation", () => {
    const r = extractFileMutation(
      part({
        type: "tool-write_file",
        state: "approval-requested",
        approval: { id: "ap1" },
        input: { path: "/p/a.txt", content: "hello" },
      }),
    );
    expect(r).toEqual({
      state: "approval-requested",
      approvalId: "ap1",
      path: "/p/a.txt",
      derive: { kind: "literal", content: "hello" },
    });
  });

  it("returns null for write_file without a path", () => {
    expect(
      extractFileMutation(
        part({ type: "tool-write_file", input: { content: "x" } }),
      ),
    ).toBeNull();
  });

  it("defaults write_file content to empty for non-string input", () => {
    const r = extractFileMutation(
      part({ type: "tool-write_file", input: { path: "/p", content: 5 } }),
    );
    expect(r?.derive).toEqual({ kind: "literal", content: "" });
  });

  it("defaults state to empty and approvalId to null when absent", () => {
    const r = extractFileMutation(
      part({ type: "tool-write_file", input: { path: "/p", content: "" } }),
    );
    expect(r?.state).toBe("");
    expect(r?.approvalId).toBeNull();
  });

  it("parses an edit part into a single edit op", () => {
    const r = extractFileMutation(
      part({
        type: "tool-edit",
        state: "approval-requested",
        approval: { id: "ap2" },
        input: {
          path: "/p/b.ts",
          old_string: "old",
          new_string: "new",
          replace_all: 1,
        },
      }),
    );
    expect(r).toEqual({
      state: "approval-requested",
      approvalId: "ap2",
      path: "/p/b.ts",
      derive: {
        kind: "edits",
        edits: [{ old_string: "old", new_string: "new", replace_all: true }],
      },
    });
  });

  it("returns null for edit without a path", () => {
    expect(
      extractFileMutation(
        part({ type: "tool-edit", input: { old_string: "a" } }),
      ),
    ).toBeNull();
  });

  it("parses multi_edit and filters ops with empty old_string", () => {
    const r = extractFileMutation(
      part({
        type: "tool-multi_edit",
        input: {
          path: "/p/c.ts",
          edits: [
            { old_string: "a", new_string: "b" },
            { old_string: "", new_string: "x" },
            { old_string: "c", new_string: "d", replace_all: true },
          ],
        },
      }),
    );
    expect(r?.derive).toEqual({
      kind: "edits",
      edits: [
        { old_string: "a", new_string: "b", replace_all: false },
        { old_string: "c", new_string: "d", replace_all: true },
      ],
    });
  });

  it("returns null for multi_edit when edits is missing or empties out", () => {
    expect(
      extractFileMutation(
        part({ type: "tool-multi_edit", input: { path: "/p" } }),
      ),
    ).toBeNull();
    expect(
      extractFileMutation(
        part({
          type: "tool-multi_edit",
          input: { path: "/p", edits: [{ old_string: "", new_string: "x" }] },
        }),
      ),
    ).toBeNull();
  });
});

describe("applyEditsLocally", () => {
  it("replaces a unique occurrence", () => {
    expect(
      applyEditsLocally("a b c", [{ old_string: "b", new_string: "X" }]),
    ).toEqual({ ok: true, content: "a X c" });
  });

  it("fails when the old string is not found", () => {
    expect(
      applyEditsLocally("abc", [{ old_string: "zz", new_string: "x" }]),
    ).toEqual({ ok: false });
  });

  it("fails when the old string is ambiguous", () => {
    expect(
      applyEditsLocally("dup dup", [{ old_string: "dup", new_string: "x" }]),
    ).toEqual({ ok: false });
  });

  it("replaces every occurrence with replace_all", () => {
    expect(
      applyEditsLocally("dup dup", [
        { old_string: "dup", new_string: "x", replace_all: true },
      ]),
    ).toEqual({ ok: true, content: "x x" });
  });

  it("fails replace_all when nothing matches", () => {
    expect(
      applyEditsLocally("abc", [
        { old_string: "z", new_string: "x", replace_all: true },
      ]),
    ).toEqual({ ok: false });
  });

  it("fails no-op and empty-old edits", () => {
    expect(
      applyEditsLocally("abc", [{ old_string: "a", new_string: "a" }]),
    ).toEqual({ ok: false });
    expect(
      applyEditsLocally("abc", [{ old_string: "", new_string: "x" }]),
    ).toEqual({ ok: false });
  });

  it("applies sequential edits, each seeing the previous result", () => {
    expect(
      applyEditsLocally("one two", [
        { old_string: "one", new_string: "1" },
        { old_string: "1 two", new_string: "done" },
      ]),
    ).toEqual({ ok: true, content: "done" });
  });
});

describe("readOriginal", () => {
  beforeEach(() => {
    readFileMock.mockReset();
  });

  it("returns empty content for protected paths without touching the fs", async () => {
    const r = await readOriginal("/home/me/.env");
    expect(r).toEqual({ content: "", isNewFile: false });
    expect(readFileMock).not.toHaveBeenCalled();
  });

  it("returns text file content", async () => {
    readFileMock.mockResolvedValue({ kind: "text", content: "body" });
    const r = await readOriginal("/proj/a.txt");
    expect(r).toEqual({ content: "body", isNewFile: false });
    expect(readFileMock).toHaveBeenCalledWith("/proj/a.txt");
  });

  it("treats binary results as empty existing content", async () => {
    readFileMock.mockResolvedValue({ kind: "binary" });
    const r = await readOriginal("/proj/img.png");
    expect(r).toEqual({ content: "", isNewFile: false });
  });

  it("flags a missing file as new", async () => {
    readFileMock.mockRejectedValue(
      new Error("No such file or directory (os error 2)"),
    );
    const r = await readOriginal("/proj/new.txt");
    expect(r).toEqual({ content: "", isNewFile: true });
  });

  it("does not flag other read errors as new files", async () => {
    readFileMock.mockRejectedValue(new Error("permission denied"));
    const r = await readOriginal("/proj/locked.txt");
    expect(r).toEqual({ content: "", isNewFile: false });
  });
});
