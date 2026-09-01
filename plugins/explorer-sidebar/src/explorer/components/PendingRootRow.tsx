/**
 * Inline "new file / new folder" input rendered at the root level of the
 * explorer (depth 0), above the virtualized list.
 */

import { fileIconUrl, folderIconUrl } from "../lib/iconResolver";
import { InlineInput } from "./InlineInput";

type Props = {
  kind: "file" | "dir";
  onCommit: (name: string) => void;
  onCancel: () => void;
};

/** Root-level pending-create row; nested pending rows use `PendingRow` instead. */
export function PendingRootRow({ kind, onCommit, onCancel }: Props) {
  return (
    <div
      className="flex h-6 w-full min-w-0 items-center gap-2 px-1.5 text-sm"
      style={{ paddingLeft: 6 }}
    >
      <span className="size-3.5 shrink-0" />
      <img
        src={
          kind === "dir" ? folderIconUrl("", false) : fileIconUrl("untitled")
        }
        alt=""
        className="size-4 shrink-0 opacity-70"
      />
      <InlineInput
        initial=""
        placeholder={kind === "dir" ? "New folder" : "New file"}
        onCommit={onCommit}
        onCancel={onCancel}
      />
    </div>
  );
}
