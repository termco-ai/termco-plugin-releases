/**
 * Placeholder tree row shown while the user is typing the name of a new file
 * or folder before it exists on disk. Split out of the former `TreeRow.tsx`.
 */
import { fileIconUrl, folderIconUrl } from "../lib/iconResolver";
import { InlineInput } from "./InlineInput";

export type PendingRowProps = {
  depth: number;
  kind: "file" | "dir";
  onCommit: (name: string) => void | Promise<void>;
  onCancel: () => void;
};

export function PendingRow({
  depth,
  kind,
  onCommit,
  onCancel,
}: PendingRowProps) {
  return (
    <div
      className="flex h-6 w-full min-w-0 items-center gap-2 px-1.5 text-sm"
      style={{ paddingLeft: 6 + depth * 12 }}
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
