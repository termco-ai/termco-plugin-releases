/**
 * The explorer's top toolbar: root-folder label plus search / new-file /
 * new-folder / refresh actions.
 */

import { Button } from "../../ui";
import {
  FileAddIcon,
  FolderAddIcon,
  Refresh01Icon,
  Search01Icon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { basename } from "../lib/explorerPaths";
import { folderIconUrl } from "../lib/iconResolver";

type Props = {
  rootPath: string;
  onToggleSearch: () => void;
  onNewFile: () => void;
  onNewFolder: () => void;
  onRefresh: () => void;
};

/** Header row for {@link FileExplorer}; all actions are lifted to the container. */
export function ExplorerHeader({
  rootPath,
  onToggleSearch,
  onNewFile,
  onNewFolder,
  onRefresh,
}: Props) {
  return (
    <div className="termco-toolbar flex h-10 shrink-0 items-center gap-1 border-b border-border/70 px-2">
      <span
        className="flex flex-1 items-center truncate text-xs font-medium text-foreground/80"
        title={rootPath}
      >
        <img
          src={folderIconUrl(basename(rootPath), false)}
          alt=""
          height={15}
          width={15}
          className="mx-1.5"
        />
        {basename(rootPath)}
      </span>

      <Button
        variant="ghost"
        size="icon"
        className="size-6 text-muted-foreground hover:text-foreground"
        onClick={onToggleSearch}
        title="Search files"
        aria-label="Search files"
      >
        <HugeiconsIcon icon={Search01Icon} size={13} strokeWidth={2} />
      </Button>

      <Button
        variant="ghost"
        size="icon"
        className="size-6 text-muted-foreground hover:text-foreground"
        onClick={onNewFile}
        title="New file"
      >
        <HugeiconsIcon icon={FileAddIcon} size={13} strokeWidth={2} />
      </Button>
      <Button
        variant="ghost"
        size="icon"
        className="size-6 text-muted-foreground hover:text-foreground"
        onClick={onNewFolder}
        title="New folder"
      >
        <HugeiconsIcon icon={FolderAddIcon} size={13} strokeWidth={2} />
      </Button>
      <Button
        variant="ghost"
        size="icon"
        className="size-6 text-muted-foreground hover:text-foreground"
        onClick={onRefresh}
        title="Refresh"
      >
        <HugeiconsIcon icon={Refresh01Icon} size={12} strokeWidth={2} />
      </Button>
    </div>
  );
}
