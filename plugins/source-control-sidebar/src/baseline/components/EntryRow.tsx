import { Checkbox } from "@termco/ui";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "@termco/ui";
import { Spinner } from "@termco/ui";
import { cn, IS_MAC } from "@termco/ui";
import { fileIconUrl } from "../../runtime";
import {
  COMPACT_CONTENT,
  COMPACT_ITEM,
  copyToClipboard,
  joinPath,
  revealInFinder,
} from "../lib/featureHelpers";
import { RemoveSquareIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { memo } from "react";
import {
  basename,
  checkboxValue,
  entryPathLabel,
  statusAccent,
} from "../lib/rowHelpers";
import { IconActionButton } from "./IconActionButton";
import type { RowDescriptor, RowRendererProps } from "./types";

export const EntryRow = memo(function EntryRow({
  row,
  focused,
  selectedPath,
  actionBusy,
  repoRoot,
  onFocusRow,
  onSelectFile,
  onToggleStageFile,
  onDiscardFile,
  onOpenFile,
}: RowRendererProps & {
  row: Extract<RowDescriptor, { kind: "entry" }>;
}) {
  const entry = row.entry;
  const isSelected = selectedPath === entry.path;
  const fileName = basename(entry.path);
  const iconUrl = fileIconUrl(fileName);
  const pathLabel = entryPathLabel(entry);
  const showDiscard = entry.unstaged;
  const isStageBusy =
    actionBusy === `stage:${entry.path}` ||
    actionBusy === `unstage:${entry.path}`;
  const isDiscardBusy = actionBusy === `discard:${entry.path}`;
  const disabled = actionBusy !== null;

  const absolutePath = repoRoot
    ? joinPath(repoRoot.replace(/\\/g, "/"), entry.path.replace(/\\/g, "/"))
    : null;
  const isDeleted = entry.statusCode === "D";
  const revealLabel = IS_MAC ? "Reveal in Finder" : "Reveal in File Manager";

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        <div
          id={`scm-row-${row.key}`}
          data-focused={focused || undefined}
          data-selected={isSelected || undefined}
          role="option"
          aria-selected={isSelected}
          onMouseDown={() => onFocusRow(row.key)}
          className={cn(
            "group relative flex h-[30px] items-center gap-2 rounded-md pl-2 pr-2 transition-all duration-100",
            focused
              ? "bg-accent/60"
              : isSelected
                ? "bg-primary/10 text-foreground"
                : "hover:bg-accent/30",
          )}
        >
          <span
            className={cn(
              "pointer-events-none absolute inset-y-1 left-0 w-[2px] rounded-full transition-opacity",
              statusAccent(entry.statusCode),
              isSelected || focused
                ? "opacity-100"
                : "opacity-55 group-hover:opacity-95",
            )}
            aria-hidden
          />
          <button
            type="button"
            onClick={() => {
              onFocusRow(row.key);
              void onSelectFile(entry);
            }}
            className="flex min-w-0 flex-1 cursor-pointer items-center gap-2 text-left"
          >
            {iconUrl ? (
              <img src={iconUrl} alt="" className="size-4 shrink-0" />
            ) : (
              <span className="size-4 shrink-0" />
            )}
            <div className="flex min-w-0 flex-1 items-baseline gap-1.5 leading-none">
              <span
                className={cn(
                  "truncate text-xs leading-tight",
                  isSelected || focused
                    ? "font-semibold text-foreground"
                    : "font-medium text-foreground/95",
                  pathLabel ? "max-w-[58%] shrink-0" : "min-w-0 flex-1",
                )}
              >
                {fileName}
              </span>
              {pathLabel ? (
                <span className="min-w-0 flex-1 truncate text-xs leading-tight text-muted-foreground/75">
                  {pathLabel}
                </span>
              ) : null}
            </div>
          </button>

          {showDiscard ? (
            <div className="flex shrink-0 items-center opacity-0 transition-opacity group-hover:opacity-100 data-[focused=true]:opacity-100 data-[selected=true]:opacity-100">
              <IconActionButton
                label={`Discard ${entry.path}`}
                disabled={disabled}
                side="top"
                onClick={() => onDiscardFile(entry)}
              >
                {isDiscardBusy ? (
                  <Spinner className="size-3" />
                ) : (
                  <HugeiconsIcon
                    icon={RemoveSquareIcon}
                    size={11}
                    strokeWidth={1.9}
                  />
                )}
              </IconActionButton>
            </div>
          ) : null}

          <span className="flex size-5 shrink-0 items-center justify-center">
            {isStageBusy ? (
              <Spinner className="size-3" />
            ) : (
              <Checkbox
                aria-label={`Stage ${entry.path}`}
                checked={checkboxValue(entry.checkState)}
                disabled={disabled}
                onCheckedChange={() => void onToggleStageFile(entry)}
                className="size-3.5"
              />
            )}
          </span>
        </div>
      </ContextMenuTrigger>

      <ContextMenuContent className={COMPACT_CONTENT}>
        {/* Open actions */}
        <ContextMenuItem
          className={COMPACT_ITEM}
          onSelect={() => {
            onFocusRow(row.key);
            void onSelectFile(entry);
          }}
        >
          Open Diff
        </ContextMenuItem>
        {!isDeleted && onOpenFile && absolutePath ? (
          <ContextMenuItem
            className={COMPACT_ITEM}
            onSelect={() => onOpenFile(absolutePath)}
          >
            Open File
          </ContextMenuItem>
        ) : null}

        <ContextMenuSeparator />

        {/* Stage / Unstage */}
        <ContextMenuItem
          className={COMPACT_ITEM}
          disabled={disabled}
          onSelect={() => void onToggleStageFile(entry)}
        >
          {entry.checkState === "checked" ? "Unstage" : "Stage"}
        </ContextMenuItem>
        {entry.unstaged ? (
          <ContextMenuItem
            className={COMPACT_ITEM}
            variant="destructive"
            disabled={disabled}
            onSelect={() => onDiscardFile(entry)}
          >
            Discard Changes
          </ContextMenuItem>
        ) : null}

        <ContextMenuSeparator />

        {/* Copy paths */}
        <ContextMenuItem
          className={COMPACT_ITEM}
          onSelect={() => void copyToClipboard(entry.path.replace(/\\/g, "/"))}
        >
          Copy Relative Path
        </ContextMenuItem>
        {absolutePath ? (
          <ContextMenuItem
            className={COMPACT_ITEM}
            onSelect={() => void copyToClipboard(absolutePath)}
          >
            Copy Absolute Path
          </ContextMenuItem>
        ) : null}

        {/* Reveal in Finder — only for existing files */}
        {!isDeleted && absolutePath ? (
          <>
            <ContextMenuSeparator />
            <ContextMenuItem
              className={COMPACT_ITEM}
              onSelect={() => void revealInFinder(absolutePath)}
            >
              {revealLabel}
            </ContextMenuItem>
          </>
        ) : null}
      </ContextMenuContent>
    </ContextMenu>
  );
});
