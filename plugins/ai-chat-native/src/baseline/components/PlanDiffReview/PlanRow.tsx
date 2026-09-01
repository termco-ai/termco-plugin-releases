/**
 * PlanRow — one row in the plan-review list: file header, +/- stats, and an
 * expandable inline diff for a single queued edit.
 */

import { Button } from "@termco/ui";
import { cn } from "@termco/ui";
import {
  ArrowDown01Icon,
  Cancel01Icon,
  FileEditIcon,
  FilePlusIcon,
  FolderAddIcon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useState } from "react";
import type { QueuedEdit } from "../../store/planStore";
import { basename, diffStats } from "./diffUtils";
import { UnifiedDiffPreview } from "./UnifiedDiffPreview";

export function PlanRow({
  item,
  onReject,
}: {
  item: QueuedEdit;
  onReject: () => void;
}) {
  const [open, setOpen] = useState(false);
  const isDir = item.kind === "create_directory";
  const isNew = item.isNewFile && !isDir;
  const stats = isDir
    ? null
    : diffStats(item.originalContent, item.proposedContent);
  const Icon = isDir ? FolderAddIcon : isNew ? FilePlusIcon : FileEditIcon;

  return (
    <li className="group/row overflow-hidden rounded-md border border-border/50 bg-card">
      <div className="flex items-start gap-2 px-2.5 py-1.5">
        <button
          type="button"
          onClick={() => !isDir && setOpen((v) => !v)}
          disabled={isDir}
          className={cn(
            "mt-0.5 shrink-0 text-muted-foreground transition-transform",
            open && "rotate-180",
            isDir && "invisible",
          )}
          aria-label="Toggle diff"
        >
          <HugeiconsIcon icon={ArrowDown01Icon} size={11} strokeWidth={1.75} />
        </button>
        <HugeiconsIcon
          icon={Icon}
          size={13}
          strokeWidth={1.75}
          className="mt-0.5 shrink-0 text-muted-foreground"
        />
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline gap-1.5 font-mono text-xs">
            <span className="truncate text-foreground">
              {basename(item.path)}
            </span>
            {isNew ? (
              <span className="text-xs text-emerald-600 dark:text-emerald-400">
                new
              </span>
            ) : null}
          </div>
          <div className="truncate font-mono text-xs text-muted-foreground">
            {item.path}
          </div>
          {stats ? (
            <div className="mt-0.5 flex items-center gap-2 text-xs tabular-nums">
              <span className="text-emerald-600 dark:text-emerald-400">
                +{stats.added}
              </span>
              <span className="text-destructive">−{stats.removed}</span>
              <span className="text-muted-foreground">
                {item.kind === "multi_edit" ? "multi-edit" : item.kind}
              </span>
            </div>
          ) : (
            <div className="mt-0.5 text-xs text-muted-foreground">
              {item.description ?? "create directory"}
            </div>
          )}
        </div>
        <Button
          type="button"
          size="icon"
          variant="ghost"
          className="size-5 shrink-0 opacity-0 transition-opacity group-hover/row:opacity-100"
          onClick={onReject}
          aria-label="Reject"
        >
          <HugeiconsIcon icon={Cancel01Icon} size={11} strokeWidth={1.75} />
        </Button>
      </div>
      {open && !isDir ? (
        <div className="border-t border-border/40 bg-muted/20 px-2.5 py-2">
          <UnifiedDiffPreview
            original={item.originalContent}
            proposed={item.proposedContent}
          />
        </div>
      ) : null}
    </li>
  );
}
