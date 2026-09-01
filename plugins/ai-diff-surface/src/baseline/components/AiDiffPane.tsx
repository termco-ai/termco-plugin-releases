/**
 * `AiDiffPane` — read-only unified-merge view of a single AI-proposed file edit.
 *
 * Renders the proposed content against the original with CodeMirror's
 * `unifiedMergeView`, a status badge, an added/removed line tally, and (while
 * pending) accept/reject controls. Diff theming, status lookups, and line-stat
 * math live in sibling `lib/` files; this component threads them together.
 */
import { Button } from "@termco/ui";
import { cn } from "@termco/ui";
import type { AiDiffStatus } from "../../tabTypes";
import { EditorState, type Extension } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { Cancel01Icon, Tick02Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useMemo } from "react";
import { computeLineStats } from "../lib/aiDiffStats";
import {
  DIFF_THEME,
  STATUS_CHIP_CLASS,
  STATUS_LABEL,
} from "../lib/aiDiffTheme";
import { buildSharedExtensions } from "../lib/extensions";
import { resolveLanguageSync } from "../lib/languageResolver";
import { useEditorThemeExt } from "../lib/useEditorThemeExt";
import { useMergeView } from "../lib/useMergeView";

type Props = {
  path: string;
  originalContent: string;
  proposedContent: string;
  status: AiDiffStatus;
  isNewFile: boolean;
  onAccept: () => void;
  onReject: () => void;
};

const SHARED_EXT: Extension[] = buildSharedExtensions();
const READONLY_EXT: Extension[] = [
  EditorState.readOnly.of(true),
  EditorView.editable.of(false),
];

function displayPath(path: string): string {
  return path.replace(/^\/private(?=\/(?:var|tmp)(?:\/|$))/, "");
}

export function AiDiffPane({
  path,
  originalContent,
  proposedContent,
  status,
  isNewFile,
  onAccept,
  onReject,
}: Props) {
  const themeExt = useEditorThemeExt();
  const visiblePath = displayPath(path);

  const initialLang = useMemo(() => resolveLanguageSync(path), [path]);
  // Shared by both columns; stable so the view is not rebuilt every render.
  const sideExtensions = useMemo(
    () => [...SHARED_EXT, ...READONLY_EXT, themeExt, DIFF_THEME],
    [themeExt],
  );
  const hostRef = useMergeView({
    original: originalContent,
    modified: proposedContent,
    extensions: sideExtensions,
    language: initialLang?.ext ?? [],
    path,
    enabled: true,
  });

  const stats = useMemo(
    () => computeLineStats(originalContent, proposedContent),
    [originalContent, proposedContent],
  );

  return (
    <div className="flex h-full min-h-0 flex-col rounded-md border border-border/60 bg-background">
      <div className="flex h-11 shrink-0 items-center justify-between gap-2 border-b border-border/60 px-3">
        <div className="flex min-w-0 items-center gap-2">
          <span
            className={cn(
              "inline-flex shrink-0 items-center gap-1.5 rounded-md px-2 py-0.5 text-xs font-semibold",
              STATUS_CHIP_CLASS[status],
            )}
          >
            {STATUS_LABEL[status]}
          </span>
          {isNewFile ? (
            <span className="shrink-0 rounded-md border border-border/60 bg-accent/40 px-1.5 py-0.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">
              New file
            </span>
          ) : null}
          <span
            className="truncate font-mono text-xs text-muted-foreground"
            title={visiblePath}
          >
            {visiblePath}
          </span>
          <span className="flex shrink-0 items-center gap-1.5 font-mono text-xs tabular-nums">
            <span className="text-chart-5">+{stats.added}</span>
            <span className="text-destructive">−{stats.removed}</span>
          </span>
        </div>
        {status === "pending" ? (
          <div className="flex shrink-0 items-center gap-1.5">
            <Button
              size="sm"
              variant="outline"
              onClick={onReject}
              className="h-7 gap-1.5 text-xs"
            >
              <HugeiconsIcon icon={Cancel01Icon} size={13} strokeWidth={2} />
              Reject
            </Button>
            <Button
              size="sm"
              variant="default"
              onClick={onAccept}
              className="h-7 gap-1.5 text-xs font-semibold"
            >
              <HugeiconsIcon icon={Tick02Icon} size={13} strokeWidth={2} />
              Accept
            </Button>
          </div>
        ) : null}
      </div>

      <div className="min-h-0 flex-1 overflow-hidden">
        <div ref={hostRef} className="h-full overflow-hidden" />
      </div>
    </div>
  );
}
