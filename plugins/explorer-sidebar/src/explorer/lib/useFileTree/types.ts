/**
 * Shared shape definitions for the file-tree hook.
 *
 * Split out of the former monolithic `useFileTree.ts`; `DirEntry` and
 * `PendingCreate` are re-exported from the folder barrel and form part of the
 * explorer module's public surface, so their fields are a frozen contract.
 */

/** One directory entry as returned by the `fs_read_dir` command. */
export type DirEntry = {
  name: string;
  kind: "file" | "dir" | "symlink";
  size: number;
  mtime: number;
  gitignored: boolean;
};

/** Async load status for a single directory's children. */
export type ChildrenState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "loaded"; entries: DirEntry[] }
  | { status: "error"; message: string };

/** Map of directory path → its children's load status. */
export type TreeState = Record<string, ChildrenState>;

/** Describes an in-progress "new file"/"new folder" inline creation. */
export type PendingCreate = {
  parentPath: string;
  kind: "file" | "dir";
};

/** Optional callbacks fired after successful rename/delete mutations. */
export type Options = {
  onPathRenamed?: (from: string, to: string) => void;
  onPathDeleted?: (path: string) => void;
};
