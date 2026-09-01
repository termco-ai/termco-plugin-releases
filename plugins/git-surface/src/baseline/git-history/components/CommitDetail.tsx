/**
 * Commit detail popover contents: header (SHA, subject, author, time),
 * copy-SHA and open-on-remote actions, and the changed-files list.
 */
import { Button } from "@termco/ui";
import type { GitCommitFileChange, GitLogEntry } from "../../../runtime";
import { Copy01Icon, LinkSquare02Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { openUrl } from "../../../runtime";
import { useEffect, useState } from "react";
import { absoluteTime } from "../lib/format";
import {
  commitWebUrl,
  hostLabel,
  type RemoteWebInfo,
} from "../lib/remoteWebUrl";
import type { FilesEntry } from "../types";
import { CommitFiles } from "./CommitFiles";

/** Props for {@link CommitDetail}. */
export type CommitDetailProps = {
  commit: GitLogEntry;
  filesEntry: FilesEntry | null;
  remoteWeb: RemoteWebInfo | null;
  onCopySha: (value: string) => Promise<void> | void;
  onOpenFile: (
    commit: GitLogEntry,
    file: GitCommitFileChange,
  ) => Promise<void> | void;
  onRetryFiles: () => void;
};

/**
 * Render the detail card for a single commit, including its changed files.
 */
export function CommitDetail({
  commit,
  filesEntry,
  remoteWeb,
  onCopySha,
  onOpenFile,
  onRetryFiles,
}: CommitDetailProps) {
  const absolute = absoluteTime(commit.timestampSecs);
  const webUrl = remoteWeb ? commitWebUrl(remoteWeb, commit.sha) : null;
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!copied) return;
    const t = window.setTimeout(() => setCopied(false), 1100);
    return () => window.clearTimeout(t);
  }, [copied]);

  return (
    <div className="flex max-h-[60vh] min-h-0 flex-col">
      <div className="shrink-0 border-b border-border/60 p-3">
        <div className="flex items-start gap-2">
          <span className="mt-px shrink-0 rounded-md border border-border/60 bg-secondary px-1.5 py-0.5 font-mono text-xs leading-none tabular-nums text-muted-foreground">
            {commit.shortSha}
          </span>
          <div className="min-w-0 flex-1 text-xs font-semibold leading-snug text-foreground">
            {commit.subject || (
              <span className="text-muted-foreground">(no subject)</span>
            )}
          </div>
        </div>
        <div className="mt-2 flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground">
          <span className="truncate">{commit.author || "Unknown"}</span>
          {commit.authorEmail ? (
            <>
              <span className="text-muted-foreground/45">·</span>
              <span className="truncate text-muted-foreground/85">
                {commit.authorEmail}
              </span>
            </>
          ) : null}
          <span className="text-muted-foreground/45">·</span>
          <span className="shrink-0 tabular-nums">{absolute}</span>
        </div>

        <div className="mt-2.5 flex items-center gap-1">
          <Button
            size="xs"
            variant="ghost"
            className="h-6 cursor-pointer gap-1.5 px-1.5 text-xs text-muted-foreground hover:text-foreground"
            onClick={() => {
              void onCopySha(commit.sha);
              setCopied(true);
            }}
          >
            <HugeiconsIcon icon={Copy01Icon} size={11} strokeWidth={1.9} />
            {copied ? "Copied" : "Copy SHA"}
          </Button>
          {webUrl ? (
            <Button
              size="xs"
              variant="ghost"
              className="h-6 cursor-pointer gap-1.5 px-1.5 text-xs text-muted-foreground hover:text-foreground"
              onClick={() => void openUrl(webUrl).catch(console.error)}
            >
              <HugeiconsIcon
                icon={LinkSquare02Icon}
                size={11}
                strokeWidth={1.9}
              />
              {hostLabel(remoteWeb!)}
            </Button>
          ) : null}
        </div>
      </div>

      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
        <CommitFiles
          commit={commit}
          filesEntry={filesEntry}
          onOpenFile={onOpenFile}
          onRetry={onRetryFiles}
        />
      </div>
    </div>
  );
}
