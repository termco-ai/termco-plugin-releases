// Kept with the source-owning terminal plugin.
import { startCompletion } from "@codemirror/autocomplete";
import type { EditorView } from "@codemirror/view";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { pathCompletions } from "./pathComplete";

vi.mock("@codemirror/autocomplete", () => ({ startCompletion: vi.fn() }));
const readDir = vi.hoisted(() => vi.fn());
vi.mock("../../../runtime", () => ({
  terminalRuntime: () => ({ files: { readDir } }),
  currentWorkspaceEnv: () => ({ kind: "local" }),
}));

function entry(
  name: string,
  kind: "file" | "dir" | "symlink" = "file",
): { name: string; kind: string; size: number; mtime: number } {
  return { name, kind, size: 0, mtime: 0 };
}

beforeEach(() => {
  readDir.mockReset();
  vi.mocked(startCompletion).mockClear();
});

describe("pathCompletions", () => {
  it("lists the cwd for a bare token", async () => {
    readDir.mockResolvedValue([entry("src", "dir"), entry("readme.md")]);
    const res = await pathCompletions("re", "/repo");
    expect(readDir).toHaveBeenCalledWith(
      "/repo",
      false,
      undefined,
      { kind: "local" },
    );
    expect(res?.fromOffset).toBe(0);
    expect(res?.options.map((o) => o.label)).toEqual(["readme.md"]);
  });

  it("resolves a relative dir part against the cwd", async () => {
    readDir.mockResolvedValue([entry("main.ts")]);
    const res = await pathCompletions("src/ma", "/repo/");
    expect(readDir).toHaveBeenCalledWith(
      "/repo/src",
      false,
      undefined,
      { kind: "local" },
    );
    expect(res?.fromOffset).toBe("src/".length);
  });

  it("resolves absolute dir parts independent of cwd", async () => {
    readDir.mockResolvedValue([entry("hosts")]);
    await pathCompletions("/etc/ho", "/repo");
    expect(readDir).toHaveBeenCalledWith(
      "/etc/",
      false,
      undefined,
      { kind: "local" },
    );
  });

  it("skips home-tilde tokens", async () => {
    expect(await pathCompletions("~/doc", "/repo")).toBeNull();
    expect(readDir).not.toHaveBeenCalled();
  });

  it("shows hidden entries only for dot-prefixed bases", async () => {
    readDir.mockResolvedValue([entry(".env")]);
    await pathCompletions(".e", "/repo");
    expect(readDir).toHaveBeenCalledWith(
      "/repo",
      true,
      undefined,
      { kind: "local" },
    );
  });

  it("filters case-insensitively and orders dirs before files", async () => {
    readDir.mockResolvedValue([
      entry("Apple.txt"),
      entry("apps", "dir"),
      entry("banana"),
      entry("app-link", "symlink"),
    ]);
    const res = await pathCompletions("ap", "/repo");
    expect(res?.options.map((o) => o.label)).toEqual([
      "apps/",
      "Apple.txt",
      "app-link",
    ]);
    expect(res?.options[0].type).toBe("type");
    expect(res?.options[1].type).toBe("variable");
  });

  it("keeps all entries when the base is empty", async () => {
    readDir.mockResolvedValue([entry("a"), entry("b", "dir")]);
    const res = await pathCompletions("", "/repo");
    expect(res?.options.map((o) => o.label)).toEqual(["b/", "a"]);
  });

  it("caps results at 200 options", async () => {
    readDir.mockResolvedValue(
      Array.from({ length: 300 }, (_, i) => entry(`file-${i}`)),
    );
    const res = await pathCompletions("", "/repo");
    expect(res?.options).toHaveLength(200);
  });

  it("returns null when the directory read fails", async () => {
    readDir.mockRejectedValue(new Error("not a dir"));
    expect(await pathCompletions("nope/", "/repo")).toBeNull();
  });

  it("directory accept inserts the segment and re-triggers completion", async () => {
    readDir.mockResolvedValue([entry("src", "dir")]);
    const res = await pathCompletions("s", "/repo");
    const opt = res?.options[0];
    const dispatch = vi.fn();
    const view = { dispatch } as unknown as EditorView;
    (opt?.apply as (v: EditorView, c: unknown, f: number, t: number) => void)(
      view,
      opt,
      0,
      1,
    );
    expect(dispatch).toHaveBeenCalledWith({
      changes: { from: 0, to: 1, insert: "src/" },
      selection: { anchor: 4 },
    });
    expect(startCompletion).toHaveBeenCalledWith(view);
  });
});
