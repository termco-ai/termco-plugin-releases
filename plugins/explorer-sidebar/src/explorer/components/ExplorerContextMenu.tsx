/**
 * Right-click menu content for the explorer.
 *
 * Renders either an entry-scoped menu (open / reveal / new / copy-path /
 * attach / delete-with-confirm) or, when no entry is targeted, a root-scoped
 * menu. The container owns all state (`menuTarget`, `deleteConfirm`, the
 * remount nonce) and threads the mutating actions in as callbacks.
 */

import {
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
} from "../../ui";
import {
  copyToClipboard,
  relativePath,
  revealInFinder,
} from "../lib/contextActions";
import { parentOf } from "../lib/explorerPaths";
import { COMPACT_CONTENT, COMPACT_ITEM } from "../lib/menuItemClass";

/** The entry a context menu currently targets, or `null` for the root menu. */
export type ExplorerContextMenuTarget = {
  path: string;
  name: string;
  isDir: boolean;
};

type Props = {
  menuTarget: ExplorerContextMenuTarget | null;
  deleteConfirm: boolean;
  setDeleteConfirm: (value: boolean) => void;
  rootPath: string;
  /** Prevent auto-focus restoration while a rename/create input is active. */
  renameInProgress: boolean;
  onOpenFile: (path: string, pin?: boolean) => void;
  onRevealInTerminal?: (path: string) => void;
  onAttachToAgent?: (path: string) => void;
  beginCreate: (parentPath: string, kind: "file" | "dir") => void;
  deletePath: (path: string) => Promise<void>;
  refresh: (path: string) => void;
};

/** Menu body for the explorer's `ContextMenu`; slots into `ContextMenuTrigger`. */
export function ExplorerContextMenu({
  menuTarget,
  deleteConfirm,
  setDeleteConfirm,
  rootPath,
  renameInProgress,
  onOpenFile,
  onRevealInTerminal,
  onAttachToAgent,
  beginCreate,
  deletePath,
  refresh,
}: Props) {
  return (
    <ContextMenuContent
      className={COMPACT_CONTENT}
      onCloseAutoFocus={(e) => {
        if (renameInProgress) e.preventDefault();
      }}
    >
      {menuTarget ? (
        <>
          {!menuTarget.isDir && (
            <ContextMenuItem
              className={COMPACT_ITEM}
              onSelect={() => onOpenFile(menuTarget.path, true)}
            >
              Open
            </ContextMenuItem>
          )}
          {menuTarget.isDir && onRevealInTerminal && (
            <ContextMenuItem
              className={COMPACT_ITEM}
              onSelect={() => onRevealInTerminal(menuTarget.path)}
            >
              Open in Terminal
            </ContextMenuItem>
          )}
          <ContextMenuItem
            className={COMPACT_ITEM}
            onSelect={() => void revealInFinder(menuTarget.path)}
          >
            Reveal in Finder
          </ContextMenuItem>
          <ContextMenuSeparator />
          <ContextMenuItem
            className={COMPACT_ITEM}
            onSelect={() =>
              beginCreate(
                menuTarget.isDir
                  ? menuTarget.path
                  : parentOf(menuTarget.path, rootPath),
                "file",
              )
            }
          >
            New File
          </ContextMenuItem>
          <ContextMenuItem
            className={COMPACT_ITEM}
            onSelect={() =>
              beginCreate(
                menuTarget.isDir
                  ? menuTarget.path
                  : parentOf(menuTarget.path, rootPath),
                "dir",
              )
            }
          >
            New Folder
          </ContextMenuItem>
          <ContextMenuSeparator />
          <ContextMenuItem
            className={COMPACT_ITEM}
            onSelect={() => void copyToClipboard(menuTarget.path)}
          >
            Copy Path
          </ContextMenuItem>
          <ContextMenuItem
            className={COMPACT_ITEM}
            onSelect={() =>
              void copyToClipboard(relativePath(rootPath, menuTarget.path))
            }
          >
            Copy Relative Path
          </ContextMenuItem>
          <ContextMenuSeparator />
          <ContextMenuItem
            className={COMPACT_ITEM}
            onSelect={() => onAttachToAgent?.(menuTarget.path)}
          >
            Attach to Agent
          </ContextMenuItem>
          <ContextMenuSeparator />
          <ContextMenuItem
            className={COMPACT_ITEM}
            variant="destructive"
            onSelect={(e) => {
              if (deleteConfirm) {
                void deletePath(menuTarget.path);
              } else {
                // Keep the menu open on the first click so the user
                // can confirm; let it close normally on the second.
                e.preventDefault();
                setDeleteConfirm(true);
              }
            }}
          >
            {deleteConfirm ? "Click again to confirm" : "Delete"}
          </ContextMenuItem>
        </>
      ) : (
        <>
          {onRevealInTerminal && (
            <ContextMenuItem
              className={COMPACT_ITEM}
              onSelect={() => onRevealInTerminal(rootPath)}
            >
              Open in Terminal
            </ContextMenuItem>
          )}
          <ContextMenuItem
            className={COMPACT_ITEM}
            onSelect={() => void revealInFinder(rootPath)}
          >
            Reveal in Finder
          </ContextMenuItem>
          <ContextMenuSeparator />
          <ContextMenuItem
            className={COMPACT_ITEM}
            onSelect={() => beginCreate(rootPath, "file")}
          >
            New File
          </ContextMenuItem>
          <ContextMenuItem
            className={COMPACT_ITEM}
            onSelect={() => beginCreate(rootPath, "dir")}
          >
            New Folder
          </ContextMenuItem>
          <ContextMenuSeparator />
          <ContextMenuItem
            className={COMPACT_ITEM}
            onSelect={() => void copyToClipboard(rootPath)}
          >
            Copy Path
          </ContextMenuItem>
          <ContextMenuItem
            className={COMPACT_ITEM}
            onSelect={() => refresh(rootPath)}
          >
            Refresh
          </ContextMenuItem>
        </>
      )}
    </ContextMenuContent>
  );
}
