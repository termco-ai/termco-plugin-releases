/**
 * Flattening of the explorer's nested tree state into a virtualizable, ordered
 * list of rows.
 *
 * `buildRows` performs a depth-first walk of the loaded/expanded tree, emitting
 * one {@link Row} per visible line (entries, the inline rename input, the
 * pending-create placeholder, and loading/error status lines) plus a
 * path → row-index map used for selection and scroll-into-view.
 */

import type { GitStatusCode } from "./gitStatusUtils";
import type { useFileTree } from "./useFileTree";

/** A single rendered line in the flattened explorer list. */
export type Row =
  | {
      kind: "entry";
      key: string;
      path: string;
      name: string;
      isDir: boolean;
      isExpanded: boolean;
      depth: number;
      gitignored: boolean;
      gitStatusCode: GitStatusCode | null;
    }
  | {
      kind: "rename";
      key: string;
      path: string;
      name: string;
      isDir: boolean;
      depth: number;
      gitignored: boolean;
      gitStatusCode: GitStatusCode | null;
    }
  | { kind: "pending"; key: string; depth: number; pendingKind: "file" | "dir" }
  | {
      kind: "status";
      key: string;
      depth: number;
      tone: "muted" | "error";
      message: string;
    };

/** Fixed row height (px) shared by the virtualizer and scroll math. */
export const ROW_HEIGHT = 24;
/** Rows rendered beyond the viewport on each side by the virtualizer. */
export const OVERSCAN = 8;

/**
 * Flatten the tree rooted at `rootPath` into ordered rows.
 *
 * @param rootPath Absolute path of the workspace root.
 * @param tree The live {@link useFileTree} return value (state + actions).
 * @param lookup Resolver from a path to its git-status code (or `null`).
 * @returns The ordered rows and a map from entry path to its row index.
 */
export function buildRows(
  rootPath: string,
  tree: ReturnType<typeof useFileTree>,
  lookup: (path: string) => GitStatusCode | null,
): { rows: Row[]; entryIndexByPath: Map<string, number> } {
  const rows: Row[] = [];
  const entryIndexByPath = new Map<string, number>();

  const walk = (parent: string, depth: number, parentIgnored: boolean) => {
    const node = tree.nodes[parent];
    if (!node || node.status !== "loaded") return;
    for (const entry of node.entries) {
      const path = tree.joinPath(parent, entry.name);
      const isDir = entry.kind === "dir";
      const expanded = isDir && tree.expanded.has(path);
      const isRenaming = tree.renaming === path;
      const gitignored = parentIgnored || entry.gitignored;
      const gitStatusCode = gitignored ? null : lookup(path);
      if (isRenaming) {
        rows.push({
          kind: "rename",
          key: `rename:${path}`,
          path,
          name: entry.name,
          isDir,
          depth,
          gitignored,
          gitStatusCode,
        });
      } else {
        entryIndexByPath.set(path, rows.length);
        rows.push({
          kind: "entry",
          key: path,
          path,
          name: entry.name,
          isDir,
          isExpanded: expanded,
          depth,
          gitignored,
          gitStatusCode,
        });
      }
      if (isDir && expanded) {
        const child = tree.nodes[path];
        if (tree.pendingCreate?.parentPath === path) {
          rows.push({
            kind: "pending",
            key: `pending:${path}`,
            depth: depth + 1,
            pendingKind: tree.pendingCreate.kind,
          });
        }
        if (child?.status === "loading") {
          rows.push({
            kind: "status",
            key: `loading:${path}`,
            depth: depth + 1,
            tone: "muted",
            message: "Loading…",
          });
        } else if (child?.status === "error") {
          rows.push({
            kind: "status",
            key: `error:${path}`,
            depth: depth + 1,
            tone: "error",
            message: child.message,
          });
        } else if (child?.status === "loaded") {
          walk(path, depth + 1, gitignored);
        }
      }
    }
  };

  walk(rootPath, 0, false);
  return { rows, entryIndexByPath };
}
