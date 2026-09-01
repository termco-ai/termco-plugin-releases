import { Button } from "@termco/ui";
import { Spinner } from "@termco/ui";
import { Textarea } from "@termco/ui";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@termco/ui";
import { cn } from "@termco/ui";
import { AiContentGenerator02Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import type { KeyboardEvent } from "react";
import { CommitFeedback } from "./CommitFeedback";
import { SOURCE_CONTROL_TOOLTIP_CLASS } from "./constants";

export function CommitComposer({
  commitMessage,
  setCommitMessage,
  onCommitKeyDown,
  commitShortcut,
  generateShortcut,
  generateCommitMessageHint,
  canGenerateCommitMessage,
  actionBusy,
  onGenerateCommitMessage,
  canCommit,
  commitHint,
  onCommit,
  canPush,
  pushDisabledReason,
  onPush,
  stagedCount,
  pushStatusLabel,
  footerFeedback,
}: {
  commitMessage: string;
  setCommitMessage: (value: string) => void;
  onCommitKeyDown: (event: KeyboardEvent<HTMLTextAreaElement>) => void;
  commitShortcut: string;
  generateShortcut: string;
  generateCommitMessageHint: string;
  canGenerateCommitMessage: boolean;
  actionBusy: string | null;
  onGenerateCommitMessage: () => Promise<void> | void;
  canCommit: boolean;
  commitHint: string;
  onCommit: () => Promise<void> | void;
  canPush: boolean;
  pushDisabledReason: string;
  onPush: () => Promise<void> | void;
  stagedCount: number;
  pushStatusLabel: string;
  footerFeedback: { tone: "error" | "success"; message: string } | null;
}) {
  return (
    <div className="relative shrink-0 space-y-2 border-b border-border/40 bg-gradient-to-b from-card/65 to-card/30 px-2.5 pb-2.5 pt-2.5">
      <div
        className={cn(
          "relative rounded-lg border border-border/60 bg-background shadow-sm transition-colors",
          "focus-within:border-primary/45 focus-within:shadow-md focus-within:shadow-primary/5",
        )}
      >
        <Textarea
          value={commitMessage}
          onChange={(event) => setCommitMessage(event.target.value)}
          onKeyDown={onCommitKeyDown}
          placeholder="Commit message"
          rows={3}
          className={cn(
            "min-h-[72px] border-border resize-none rounded-lg bg-transparent px-3 pb-7 pt-2.5 text-xs leading-snug shadow-none placeholder:text-muted-foreground/65 focus-visible:ring-0 focus:border-0",
          )}
        />
        <div className="pointer-events-none absolute inset-x-3 bottom-1.5 flex items-center justify-between p-1 gap-2 text-xs tabular-nums text-muted-foreground/55">
          {commitMessage.length > 0 ? (
            <span>Ch: {commitMessage.length}</span>
          ) : (
            <span className="flex gap-2 items-center">
              {commitShortcut} <p>to commit</p>
            </span>
          )}
        </div>
        <div className="absolute right-1 top-1">
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                aria-label={`${generateCommitMessageHint} (${generateShortcut})`}
                disabled={!canGenerateCommitMessage}
                onClick={() => void onGenerateCommitMessage()}
                className={cn(
                  "inline-flex size-6 cursor-pointer items-center justify-center rounded-md text-muted-foreground/65 transition-colors",
                  "hover:bg-foreground/[0.06] hover:text-foreground",
                  "disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-transparent disabled:hover:text-muted-foreground/65",
                )}
              >
                {actionBusy === "generate-message" ? (
                  <Spinner className="size-3" />
                ) : (
                  <HugeiconsIcon
                    icon={AiContentGenerator02Icon}
                    size={14}
                    strokeWidth={1.75}
                  />
                )}
              </button>
            </TooltipTrigger>
            <TooltipContent
              side="left"
              className={cn(SOURCE_CONTROL_TOOLTIP_CLASS, "text-xs")}
            >
              {`${generateCommitMessageHint} (${generateShortcut})`}
            </TooltipContent>
          </Tooltip>
        </div>
      </div>

      <div className="flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground">
        <span
          className={cn(
            "size-1.5 shrink-0 rounded-full transition-colors",
            canCommit
              ? "bg-foreground/80"
              : stagedCount > 0
                ? "bg-muted-foreground/60"
                : "bg-muted-foreground/30",
          )}
        />
        <span className="truncate font-medium text-foreground/85">
          {stagedCount === 0
            ? "Nothing staged"
            : `${stagedCount} ${stagedCount === 1 ? "file" : "files"} staged`}
        </span>
        <span className="ml-auto shrink-0 truncate text-muted-foreground/65">
          {pushStatusLabel}
        </span>
      </div>

      <div className="grid w-full grid-cols-2 gap-1.5">
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              size="xs"
              className="h-[30px] cursor-pointer rounded-lg text-xs font-semibold tracking-tight shadow-sm disabled:cursor-not-allowed disabled:shadow-none"
              disabled={!canCommit}
              onClick={() => void onCommit()}
            >
              {actionBusy === "commit" ? "Committing…" : "Commit"}
            </Button>
          </TooltipTrigger>
          <TooltipContent
            side="bottom"
            className={cn(SOURCE_CONTROL_TOOLTIP_CLASS, "text-xs")}
          >
            {commitHint}
          </TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              size="xs"
              variant="outline"
              className="h-[30px] cursor-pointer rounded-lg text-xs font-medium disabled:cursor-not-allowed"
              disabled={!canPush || !!actionBusy}
              onClick={() => void onPush()}
            >
              {actionBusy === "push" ? "Pushing…" : "Push"}
            </Button>
          </TooltipTrigger>
          <TooltipContent
            side="bottom"
            className={cn(SOURCE_CONTROL_TOOLTIP_CLASS, "max-w-64 text-xs")}
          >
            {pushDisabledReason}
          </TooltipContent>
        </Tooltip>
      </div>

      <CommitFeedback feedback={footerFeedback} />
    </div>
  );
}
