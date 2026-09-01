import { describe, expect, it } from "vitest";
import { buildRows, OVERSCAN, ROW_HEIGHT } from "./buildRows";
import type { GitStatusCode } from "./gitStatusUtils";
import type { useFileTree } from "./useFileTree";
import { joinPath } from "./useFileTree/paths";
import type { DirEntry, PendingCreate, TreeState } from "./useFileTree/types";

type Tree = ReturnType<typeof useFileTree>;

function entry(
  name: string,
  kind: DirEntry["kind"] = "file",
  gitignored = false,
): DirEntry {
  return { name, kind, size: 0, mtime: 0, gitignored };
}

function makeTree(partial: {
  nodes: TreeState;
  expanded?: Set<string>;
  renaming?: string | null;
  pendingCreate?: PendingCreate | null;
}): Tree {
  return {
    nodes: partial.nodes,
    expanded: partial.expanded ?? new Set(),
    renaming: partial.renaming ?? null,
    pendingCreate: partial.pendingCreate ?? null,
    joinPath,
  } as unknown as Tree;
}

const noStatus = () => null;

describe("buildRows", () => {
  it("returns nothing when the root is not loaded", () => {
    const { rows, entryIndexByPath } = buildRows(
      "/ws",
      makeTree({ nodes: { "/ws": { status: "loading" } } }),
      noStatus,
    );
    expect(rows).toEqual([]);
    expect(entryIndexByPath.size).toBe(0);
  });

  it("emits one entry row per visible entry with an index map", () => {
    const tree = makeTree({
      nodes: {
        "/ws": {
          status: "loaded",
          entries: [entry("src", "dir"), entry("a.ts")],
        },
      },
    });
    const { rows, entryIndexByPath } = buildRows("/ws", tree, noStatus);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({
      kind: "entry",
      path: "/ws/src",
      isDir: true,
      isExpanded: false,
      depth: 0,
    });
    expect(rows[1]).toMatchObject({
      kind: "entry",
      path: "/ws/a.ts",
      isDir: false,
    });
    expect(entryIndexByPath.get("/ws/src")).toBe(0);
    expect(entryIndexByPath.get("/ws/a.ts")).toBe(1);
  });

  it("walks into expanded loaded directories with increasing depth", () => {
    const tree = makeTree({
      nodes: {
        "/ws": { status: "loaded", entries: [entry("src", "dir")] },
        "/ws/src": { status: "loaded", entries: [entry("b.ts")] },
      },
      expanded: new Set(["/ws/src"]),
    });
    const { rows } = buildRows("/ws", tree, noStatus);
    expect(rows.map((r) => r.key)).toEqual(["/ws/src", "/ws/src/b.ts"]);
    expect(rows[0]).toMatchObject({ isExpanded: true, depth: 0 });
    expect(rows[1]).toMatchObject({ depth: 1 });
  });

  it("emits a loading status row for an expanded loading directory", () => {
    const tree = makeTree({
      nodes: {
        "/ws": { status: "loaded", entries: [entry("src", "dir")] },
        "/ws/src": { status: "loading" },
      },
      expanded: new Set(["/ws/src"]),
    });
    const { rows } = buildRows("/ws", tree, noStatus);
    expect(rows[1]).toMatchObject({
      kind: "status",
      tone: "muted",
      depth: 1,
    });
  });

  it("emits an error status row with the message", () => {
    const tree = makeTree({
      nodes: {
        "/ws": { status: "loaded", entries: [entry("src", "dir")] },
        "/ws/src": { status: "error", message: "denied" },
      },
      expanded: new Set(["/ws/src"]),
    });
    const { rows } = buildRows("/ws", tree, noStatus);
    expect(rows[1]).toMatchObject({
      kind: "status",
      tone: "error",
      message: "denied",
    });
  });

  it("replaces a renaming entry with a rename row and skips its index", () => {
    const tree = makeTree({
      nodes: {
        "/ws": { status: "loaded", entries: [entry("a.ts"), entry("b.ts")] },
      },
      renaming: "/ws/a.ts",
    });
    const { rows, entryIndexByPath } = buildRows("/ws", tree, noStatus);
    expect(rows[0]).toMatchObject({
      kind: "rename",
      key: "rename:/ws/a.ts",
      name: "a.ts",
    });
    expect(entryIndexByPath.has("/ws/a.ts")).toBe(false);
    expect(entryIndexByPath.get("/ws/b.ts")).toBe(1);
  });

  it("inserts a pending row under the expanded parent being created into", () => {
    const tree = makeTree({
      nodes: {
        "/ws": { status: "loaded", entries: [entry("src", "dir")] },
        "/ws/src": { status: "loaded", entries: [] },
      },
      expanded: new Set(["/ws/src"]),
      pendingCreate: { parentPath: "/ws/src", kind: "file" },
    });
    const { rows } = buildRows("/ws", tree, noStatus);
    expect(rows[1]).toMatchObject({
      kind: "pending",
      key: "pending:/ws/src",
      depth: 1,
      pendingKind: "file",
    });
  });

  it("propagates gitignored to descendants and suppresses their status", () => {
    const lookup = (path: string): GitStatusCode | null =>
      path === "/ws/src/b.ts" || path === "/ws/dist" ? "M" : null;
    const tree = makeTree({
      nodes: {
        "/ws": {
          status: "loaded",
          entries: [entry("dist", "dir", true), entry("src", "dir")],
        },
        "/ws/dist": { status: "loaded", entries: [entry("out.js")] },
        "/ws/src": { status: "loaded", entries: [entry("b.ts")] },
      },
      expanded: new Set(["/ws/dist", "/ws/src"]),
    });
    const { rows } = buildRows("/ws", tree, lookup);
    const byPath = new Map(
      rows.flatMap((r) => (r.kind === "entry" ? [[r.path, r] as const] : [])),
    );
    expect(byPath.get("/ws/dist")).toMatchObject({
      gitignored: true,
      gitStatusCode: null,
    });
    expect(byPath.get("/ws/dist/out.js")).toMatchObject({
      gitignored: true,
      gitStatusCode: null,
    });
    expect(byPath.get("/ws/src/b.ts")).toMatchObject({
      gitignored: false,
      gitStatusCode: "M",
    });
  });

  it("exports the virtualizer geometry constants", () => {
    expect(ROW_HEIGHT).toBe(24);
    expect(OVERSCAN).toBe(8);
  });
});
