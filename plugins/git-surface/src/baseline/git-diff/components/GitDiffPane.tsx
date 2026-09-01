/**
 * `GitDiffPane` — read-only unified-merge view of a git working-tree or commit
 * file change.
 *
 * Loads the before/after content for its `source` (with a synchronous cache
 * read so tab switches paint instantly), then renders a CodeMirror merge view —
 * or a plain patch fallback for binary and oversized files. Diff sources, cache
 * keys, theming, and stat counting live in sibling `lib/` files.
 */
import type { DiffSideState } from "../../../runtime";
import { Badge } from "@termco/ui";
import { ScrollArea } from "@termco/ui";
import { Spinner } from "@termco/ui";
import { EditorState } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { useEffect, useMemo, useState } from "react";
import { fetchCommitDiff, fetchWorkingDiff } from "../lib/diffCache";
import { buildSharedExtensions } from "../lib/extensions";
import {
  type CommitSource,
  cacheKey,
  type LoadState,
  loadStateFromCache,
  type WorkingSource,
} from "../lib/gitDiffLoadState";
import { countDiffLines } from "../lib/gitDiffStats";
import { DIFF_THEME } from "../lib/gitDiffTheme";
import { resolveLanguageSync } from "../lib/languageResolver";
import { useMergeView } from "../lib/useMergeView";
import { useEditorThemeExt } from "../lib/useEditorThemeExt";

type Props = {
  source: WorkingSource | CommitSource;
  chipLabel?: string;
  active: boolean;
};

const LARGE_FILE_THRESHOLD = 256 * 1024;

const SHARED_EXT = buildSharedExtensions();
const READONLY_EXT = [
  EditorState.readOnly.of(true),
  EditorView.editable.of(false),
];

/**
 * Turn "one side of this diff could not be read" into something true.
 *
 * Without this the viewer rendered a missing file exactly like a deleted one —
 * a full wall of red — which is how an SSH rig reading the working copy from
 * the wrong machine looked like a plausible diff instead of a bug. A new file
 * needs no notice: an all-green diff is what it actually is.
 */
function diffNotice(
  original: DiffSideState,
  modified: DiffSideState,
): { title: string; detail: string } | null {
  if (original === "missing" && modified === "missing") {
    return {
      title: "Nothing to compare",
      detail:
        "Neither side of this diff could be read. The file may have been deleted, or the path may no longer exist in this repository.",
    };
  }
  if (modified === "missing") {
    return {
      title: "This file is not in the working tree",
      detail:
        "Only the previous version could be read, so the whole file would show as deleted. If you did not delete it, the working copy could not be reached — on a remote rig, check that the connection is up.",
    };
  }
  return null;
}

export function GitDiffPane({ source, chipLabel, active }: Props) {
  const themeExt = useEditorThemeExt();
  const [state, setState] = useState<LoadState>(() =>
    active ? loadStateFromCache(source) : { kind: "idle" },
  );

  const key = cacheKey(source);

  useEffect(() => {
    if (!active) return;
    const cached = loadStateFromCache(source);
    if (cached.kind === "loaded") {
      setState(cached);
      return;
    }
    let cancelled = false;
    setState({ kind: "loading" });
    const promise =
      source.kind === "working"
        ? fetchWorkingDiff(
            source.repoRoot,
            source.path,
            source.mode,
            source.originalPath,
            source.workspace,
          )
        : fetchCommitDiff(
            source.repoRoot,
            source.sha,
            source.path,
            source.originalPath,
            source.workspace,
          );
    promise
      .then((res) => {
        if (cancelled) return;
        setState({
          kind: "loaded",
          originalContent: res.originalContent,
          modifiedContent: res.modifiedContent,
          // A result cached by an older build carries no state; "ok" keeps it
          // rendering exactly as it did before.
          originalState: res.originalState ?? "ok",
          modifiedState: res.modifiedState ?? "ok",
          isBinary: res.isBinary,
          fallbackPatch: res.fallbackPatch,
        });
      })
      .catch((err) => {
        if (cancelled) return;
        setState({
          kind: "error",
          message:
            err && typeof err === "object" && "message" in err
              ? String((err as { message: unknown }).message)
              : String(err),
        });
      });
    return () => {
      cancelled = true;
    };
  }, [active, key, source]);

  const path = source.path;
  const repoRoot = source.repoRoot;
  const mode = source.kind === "working" ? source.mode : "+";
  const loaded = state.kind === "loaded" ? state : null;
  const originalContent = loaded?.originalContent ?? "";
  const modifiedContent = loaded?.modifiedContent ?? "";
  const isBinary = loaded?.isBinary ?? false;
  const fallbackPatch = loaded?.fallbackPatch ?? "";
  // Older cached results carry no state; treat them as fine so nothing
  // regresses into a warning it never had.
  const originalState = loaded?.originalState ?? "ok";
  const modifiedState = loaded?.modifiedState ?? "ok";
  const notice = diffNotice(originalState, modifiedState);

  const isTooLarge =
    originalContent.length > LARGE_FILE_THRESHOLD ||
    modifiedContent.length > LARGE_FILE_THRESHOLD;
  const useFallback = isBinary || isTooLarge;

  const initialLang = useMemo(() => resolveLanguageSync(path), [path]);
  // Shared by both columns. Kept stable so the merge view is not torn down and
  // rebuilt on every render.
  const sideExtensions = useMemo(
    () => [...SHARED_EXT, ...READONLY_EXT, themeExt, DIFF_THEME],
    [themeExt],
  );

  const showMerge =
    state.kind === "loaded" && !notice && !useFallback;
  const hostRef = useMergeView({
    original: originalContent,
    modified: modifiedContent,
    extensions: sideExtensions,
    language: initialLang?.ext ?? [],
    path,
    enabled: showMerge,
  });

  const stats = useMemo(
    () =>
      useFallback ? countDiffLines(fallbackPatch) : { added: 0, removed: 0 },
    [useFallback, fallbackPatch],
  );

  return (
    <div className="flex h-full min-h-0 flex-col bg-background">
      <div className="termco-toolbar flex h-11 shrink-0 items-center justify-between gap-3 border-b border-border/70 px-3">
        <div className="flex min-w-0 items-center gap-2">
          <Badge
            variant="outline"
            className="inline-flex items-center gap-1.5 rounded-[6px] px-2 py-0.5 font-mono text-xs font-semibold"
          >
            {chipLabel ?? mode}
          </Badge>
          {originalState === "missing" && modifiedState === "ok" ? (
            <Badge variant="secondary" className="rounded-[6px] text-xs">
              New file
            </Badge>
          ) : null}
          {isBinary ? (
            <Badge variant="secondary" className="rounded-[6px] text-xs">
              Binary / patch fallback
            </Badge>
          ) : isTooLarge ? (
            <Badge variant="secondary" className="rounded-[6px] text-xs">
              Large file / patch view
            </Badge>
          ) : null}
          <span
            className="truncate font-mono text-xs text-muted-foreground"
            title={path}
          >
            {path}
          </span>
        </div>
        <div className="flex shrink-0 items-center gap-3 font-mono text-xs tabular-nums text-muted-foreground">
          <span className="truncate max-w-80">{repoRoot}</span>
          {useFallback ? (
            <>
              <span className="text-chart-5">+{stats.added}</span>
              <span className="text-destructive">−{stats.removed}</span>
            </>
          ) : null}
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-hidden">
        {state.kind === "loading" || state.kind === "idle" ? (
          <div className="flex h-full items-center justify-center gap-2 text-xs text-muted-foreground">
            <Spinner className="size-3" />
            Loading diff…
          </div>
        ) : state.kind === "error" ? (
          <div className="flex h-full items-center justify-center px-6 text-center text-xs text-destructive">
            {state.message}
          </div>
        ) : notice ? (
          <div className="flex h-full flex-col items-center justify-center gap-1.5 px-6 text-center">
            <p className="text-xs font-medium text-foreground">{notice.title}</p>
            <p className="max-w-md text-xs text-muted-foreground">
              {notice.detail}
            </p>
          </div>
        ) : useFallback ? (
          <ScrollArea className="h-full">
            <pre className="min-h-full whitespace-pre-wrap wrap-break-word p-4 font-mono text-xs leading-relaxed text-muted-foreground">
              {fallbackPatch || "Diff preview is not available for this file."}
            </pre>
          </ScrollArea>
        ) : (
          <div ref={hostRef} className="h-full overflow-hidden" />
        )}
      </div>
    </div>
  );
}
