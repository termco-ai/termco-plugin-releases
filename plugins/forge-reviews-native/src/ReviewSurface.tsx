/**
 * Review workspace direction: a compact inspect surface, not a dashboard.
 * The exact revision and branch direction stay visible, the changed-file
 * navigator remains stable, and only one file patch is mounted at a time.
 * Comments are local drafts until the user confirms a publish transaction.
 *
 * Visual grammar follows the neighbouring Git Diff and Git History surfaces:
 * 12px label/code floor, `chart-5` / `destructive` for +/- counts, the same
 * line wash as the CodeMirror merge view, `Badge` for status taxonomy, and
 * iris reserved for the one action the user can take now.
 */
import {
  AiChat01Icon,
  Cancel01Icon,
  CancelCircleIcon,
  CheckmarkCircle02Icon,
  CircleIcon,
  Clock01Icon,
  CommentAdd01Icon,
  Edit02Icon,
  GitBranchIcon,
  LinkSquare01Icon,
  MinusSignCircleIcon,
  Refresh01Icon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import type { AiSessionsCapability } from "@termco/ai-sessions-base";
import type { DesktopIntegrationCapability } from "@termco/desktop-base";
import type {
  ForgeReviewCommentDraft,
  ForgeReviewFile,
  ForgeReviewFileStatus,
  ForgeReviewInspection,
  ForgeReviewOutcome,
  ForgeReviewsCapability,
} from "@termco/forge-reviews-base";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  Badge,
  Button,
  Spinner,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  Textarea,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
  cn,
} from "@termco/ui";
import type { UiTabSurfaceProps } from "@termco/ui-tabs-base";
import {
  type KeyboardEvent,
  type ReactNode,
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { type ReviewSplitDiffCell, reviewSplitDiffRows, reviewUnifiedDiffRows } from "./diffLines";
import { forgeReviewDrafts, reviewDraftKey, type StoredForgeReviewDraft } from "./drafts";
import { forgeReviewTabData } from "./tabs";
import { startReviewConversation } from "./reviewChat";

type ReviewView = "overview" | "changes" | "conversations" | "checks" | "history";
type FileFilter = "all" | "commented" | "open";
type CommentTarget = Pick<ForgeReviewCommentDraft, "path" | "line" | "side"> & {
  replyToId?: string | null;
  replyToAuthor?: string | null;
  conversationKey?: string | null;
};
type DraftInput = ForgeReviewCommentDraft & { conversationKey?: string | null };

type RevealLocation = { path: string; line: number; side?: "old" | "new" | null; revision: number };

interface ReviewThread {
  key: string;
  messages: ForgeReviewInspection["discussions"];
  replyToId: string | null;
}

const VIEW_LABELS: Record<ReviewView, string> = {
  overview: "Overview",
  changes: "Changes",
  conversations: "Conversations",
  checks: "Checks",
  history: "History",
};

const FILTER_LABELS: Record<FileFilter, string> = {
  all: "All",
  commented: "Commented",
  open: "Open",
};

const OUTCOME_LABELS: Record<ForgeReviewOutcome, string> = {
  comment: "Comment",
  approve: "Approve",
  request_changes: "Request changes",
};

/** Same line wash and gutter stripe as the CodeMirror merge view (gitDiffTheme). */
const LINE_ADDED = "bg-[rgba(110,200,120,0.16)]";
const LINE_REMOVED = "bg-[rgba(220,90,90,0.16)]";
const GUTTER_ADDED = "bg-[rgba(110,200,120,0.75)]";
const GUTTER_REMOVED = "bg-[rgba(220,90,90,0.75)]";
const SPACER_HATCH =
  "bg-[repeating-linear-gradient(45deg,rgba(128,128,128,0.10)_0_6px,transparent_6px_12px)]";

const SHA_CHIP =
  "rounded-md border border-border/60 bg-secondary px-1.5 py-0.5 font-mono text-xs leading-none tabular-nums text-muted-foreground";

function statusTone(state: string): string {
  const normalized = state.toLowerCase();
  if (["success", "passed", "completed", "approved"].some((part) => normalized.includes(part))) {
    return "text-emerald-600 dark:text-emerald-400";
  }
  if (["fail", "error", "cancel", "blocked"].some((part) => normalized.includes(part))) {
    return "text-destructive";
  }
  return "text-muted-foreground";
}

/** "changes_requested" → "Changes requested". */
function humanize(value: string): string {
  const spaced = value.replaceAll("_", " ").trim().toLowerCase();
  return spaced ? spaced[0].toUpperCase() + spaced.slice(1) : value;
}

function shortSha(sha: string | null): string {
  return sha?.slice(0, 8) ?? "unknown";
}

function reviewTime(value: string | null): string {
  if (!value) return "Time unavailable";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Time unavailable";
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

function clockTime(date: Date): string {
  return new Intl.DateTimeFormat(undefined, { timeStyle: "short" }).format(date);
}

function basename(path: string): string {
  const parts = path.split("/").filter(Boolean);
  return parts.length > 0 ? parts[parts.length - 1] : path;
}

function dirname(path: string): string {
  const index = path.lastIndexOf("/");
  return index <= 0 ? "" : path.slice(0, index);
}

/** Mirrors git-history's status letters and tones so both lists read alike. */
function fileStatusMeta(status: ForgeReviewFileStatus): {
  letter: string;
  label: string;
  tone: string;
} {
  switch (status) {
    case "added":
      return { letter: "A", label: "Added", tone: "text-emerald-600 dark:text-emerald-400" };
    case "deleted":
      return { letter: "D", label: "Deleted", tone: "text-rose-600 dark:text-rose-400" };
    case "renamed":
      return { letter: "R", label: "Renamed", tone: "text-sky-600 dark:text-sky-300" };
    case "binary":
      return { letter: "•", label: "Binary", tone: "text-muted-foreground" };
    default:
      return { letter: "M", label: "Modified", tone: "text-amber-600 dark:text-amber-300" };
  }
}

function checkPresentation(state: string): {
  icon: typeof CheckmarkCircle02Icon;
  tone: string;
  label: string;
} {
  const normalized = state.toLowerCase();
  const has = (...parts: string[]) => parts.some((part) => normalized.includes(part));
  if (has("success", "passed", "completed", "succeeded")) {
    return { icon: CheckmarkCircle02Icon, tone: statusTone("success"), label: "Passed" };
  }
  if (has("fail", "error", "timed_out", "timeout")) {
    return { icon: CancelCircleIcon, tone: "text-destructive", label: "Failed" };
  }
  if (has("cancel")) {
    return { icon: MinusSignCircleIcon, tone: "text-muted-foreground", label: "Cancelled" };
  }
  if (has("skip", "neutral")) {
    return { icon: MinusSignCircleIcon, tone: "text-muted-foreground", label: "Skipped" };
  }
  if (has("progress", "running")) {
    return { icon: Clock01Icon, tone: "text-muted-foreground", label: "Running" };
  }
  if (has("pending", "queued", "expected", "waiting")) {
    return { icon: Clock01Icon, tone: "text-muted-foreground", label: "Pending" };
  }
  return { icon: CircleIcon, tone: "text-muted-foreground", label: humanize(state) };
}

function discussionThreads(
  discussions: ForgeReviewInspection["discussions"],
): ReviewThread[] {
  const threads = new Map<string, ReviewThread>();
  discussions.forEach((discussion, index) => {
    const key = discussion.threadId ? `thread:${discussion.threadId}` : `item:${discussion.id ?? index}`;
    const current = threads.get(key);
    if (current) {
      current.messages.push(discussion);
      if (!current.replyToId && discussion.replyToId) current.replyToId = discussion.replyToId;
      return;
    }
    threads.set(key, {
      key,
      messages: [discussion],
      replyToId: discussion.replyToId,
    });
  });
  return [...threads.values()];
}

function isOpenThread(thread: ReviewThread): boolean {
  const first = thread.messages[0];
  return Boolean(first?.resolvable && first.resolved === false);
}

function safeReviewUrl(host: string, raw: string): string | null {
  try {
    const url = new URL(raw);
    return ["http:", "https:"].includes(url.protocol) &&
      url.hostname.toLowerCase() === host.toLowerCase()
      ? url.toString()
      : null;
  } catch {
    return null;
  }
}

function safeHttpUrl(raw: string | null): string | null {
  if (!raw) return null;
  try {
    const url = new URL(raw);
    return ["http:", "https:"].includes(url.protocol) ? url.toString() : null;
  } catch {
    return null;
  }
}

function DiffStat({ additions, deletions }: { additions: number; deletions: number }) {
  return (
    <span className="shrink-0 font-mono text-xs tabular-nums">
      <span className="text-chart-5">+{additions}</span>{" "}
      <span className="text-destructive">−{deletions}</span>
    </span>
  );
}

function ThreadStateBadges({
  resolved,
  outdated,
}: {
  resolved: boolean | null;
  outdated?: boolean;
}) {
  return (
    <>
      {resolved !== null ? (
        <Badge
          variant={resolved ? "secondary" : "outline"}
          className={cn("h-4 rounded-[6px] px-1.5 text-xs", !resolved && "text-foreground")}
        >
          {resolved ? "Resolved" : "Open"}
        </Badge>
      ) : null}
      {outdated ? (
        <Badge variant="secondary" className="h-4 rounded-[6px] px-1.5 text-xs">
          Outdated
        </Badge>
      ) : null}
    </>
  );
}

function FileList({
  files,
  totalFiles,
  fileThreadCounts,
  filter,
  filterCounts,
  onFilter,
  selectedPath,
  onSelect,
}: {
  files: ForgeReviewFile[];
  totalFiles: number;
  fileThreadCounts: Map<string, { total: number; open: number }>;
  filter: FileFilter;
  filterCounts: Record<FileFilter, number>;
  onFilter: (filter: FileFilter) => void;
  selectedPath: string | null;
  onSelect: (path: string) => void;
}) {
  return (
    <nav
      aria-label="Changed files"
      className="flex min-h-0 flex-col border-r border-border/60 bg-muted/15"
    >
      <div className="shrink-0 border-b border-border/60">
        <div className="flex h-7 items-center gap-2 px-3">
          <span className="text-xs font-semibold text-muted-foreground">
            Changed files
          </span>
          <span className="inline-flex h-4 min-w-4 items-center justify-center rounded-full border border-border/60 px-1 text-xs font-semibold tabular-nums text-muted-foreground">
            {files.length === totalFiles ? totalFiles : `${files.length}/${totalFiles}`}
          </span>
        </div>
        <div
          role="group"
          aria-label="Filter changed files"
          className="flex flex-wrap gap-1 px-2 pb-2"
        >
          {(["all", "commented", "open"] as const).map((item) => (
            <button
              key={item}
              type="button"
              aria-pressed={filter === item}
              onClick={() => onFilter(item)}
              className={cn(
                "inline-flex h-6 items-center gap-1 rounded-md px-2 text-xs font-medium outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring/35",
                filter === item
                  ? "bg-primary/12 text-primary"
                  : "text-muted-foreground hover:bg-accent hover:text-foreground",
              )}
            >
              {FILTER_LABELS[item]}
              <span className="tabular-nums opacity-65">{filterCounts[item]}</span>
            </button>
          ))}
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain py-1">
        {files.length === 0 ? (
          <p className="px-3 py-3 text-xs leading-5 text-muted-foreground">
            {totalFiles === 0
              ? "This review changes no text files."
              : "No changed files match this filter."}
          </p>
        ) : null}
        {files.map((file) => {
          const status = fileStatusMeta(file.status);
          const counts = fileThreadCounts.get(file.path);
          const selected = selectedPath === file.path;
          const directory = dirname(file.path);
          return (
            <button
              key={file.path}
              type="button"
              aria-current={selected ? "true" : undefined}
              title={`${file.path} · ${status.label}`}
              onClick={() => onSelect(file.path)}
              className={cn(
                "group flex h-7 w-full min-w-0 items-center gap-2 px-3 text-left outline-none transition-colors focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring/35",
                selected ? "bg-accent text-foreground" : "hover:bg-accent/45",
              )}
            >
              <span
                aria-label={status.label}
                className={cn(
                  "w-3 shrink-0 text-center font-mono text-xs font-semibold",
                  status.tone,
                )}
              >
                {status.letter}
              </span>
              <span className="flex min-w-0 flex-1 items-baseline gap-1.5 leading-none">
                <span className="truncate text-xs font-medium">{basename(file.path)}</span>
                {directory ? (
                  <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground/75">
                    {directory}
                  </span>
                ) : null}
              </span>
              {counts && counts.total > 0 ? (
                <span
                  className={cn(
                    "inline-flex h-4 min-w-4 shrink-0 items-center justify-center rounded-full border px-1 text-xs font-semibold tabular-nums",
                    counts.open > 0
                      ? "border-border text-foreground"
                      : "border-border/60 text-muted-foreground",
                  )}
                  title={`${counts.total} conversation${counts.total === 1 ? "" : "s"}${counts.open ? `, ${counts.open} open` : ""}`}
                >
                  {counts.open > 0 ? counts.open : counts.total}
                </span>
              ) : null}
              <DiffStat additions={file.additions} deletions={file.deletions} />
            </button>
          );
        })}
      </div>
    </nav>
  );
}

function DraftComposer({
  target,
  onCancel,
  onAdd,
}: {
  target: CommentTarget;
  onCancel: () => void;
  onAdd: (draft: DraftInput) => void;
}) {
  const [body, setBody] = useState("");
  const labelId = useId();
  const canAdd = body.trim().length > 0;
  const submit = () => {
    if (canAdd) onAdd({ ...target, body: body.trim() });
  };
  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === "Escape") {
      event.preventDefault();
      onCancel();
      return;
    }
    if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
      event.preventDefault();
      submit();
    }
  };
  return (
    <div className="border-y border-primary/25 bg-primary/[0.035] px-3 py-3 font-sans">
      <p id={labelId} className="mb-2 text-xs font-medium text-muted-foreground">
        {target.replyToAuthor
          ? `Reply to @${target.replyToAuthor}`
          : target.path
          ? `${target.path}${target.line ? `:${target.line}` : ""}`
          : "Overall review comment"}
      </p>
      <Textarea
        autoFocus
        aria-labelledby={labelId}
        value={body}
        onChange={(event) => setBody(event.target.value)}
        onKeyDown={onKeyDown}
        placeholder="Leave a clear, actionable comment…"
        className="min-h-24 resize-y bg-background font-sans text-sm"
      />
      <div className="mt-2 flex items-center justify-end gap-2">
        <span className="mr-auto text-xs text-muted-foreground">Local draft until you submit</span>
        <Button size="xs" variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
        <Button size="xs" disabled={!canAdd} onClick={submit}>
          Add draft
        </Button>
      </div>
    </div>
  );
}

function ThreadActions({
  thread,
  side,
  onTarget,
  onResolve,
  canResolve,
  resolvingThreadId,
  resolveLabels,
  canReply,
}: {
  thread: ReviewThread;
  side: "old" | "new" | null;
  onTarget: (target: CommentTarget) => void;
  onResolve: (thread: ReviewThread, resolved: boolean) => void;
  canResolve: boolean;
  resolvingThreadId: string | null;
  resolveLabels: [reopen: string, resolve: string];
  canReply: boolean;
}) {
  const first = thread.messages[0];
  if (!first) return null;
  const threadId = first.threadId;
  const resolving = Boolean(threadId && resolvingThreadId === threadId);
  const showResolve = canResolve && first.resolvable && threadId;
  if (!canReply && !showResolve) return null;
  return (
    <div className="mt-2 flex flex-wrap items-center gap-1.5">
      {canReply ? (
        <Button
          size="xs"
          variant="outline"
          onClick={() =>
            onTarget({
              path: first.path,
              line: first.line,
              side: first.side ?? side,
              replyToId: thread.replyToId,
              replyToAuthor: thread.messages.at(-1)?.author ?? first.author,
              conversationKey: thread.key,
            })
          }
        >
          Reply
        </Button>
      ) : null}
      {showResolve ? (
        <Button
          size="xs"
          variant="ghost"
          disabled={resolving}
          onClick={() => onResolve(thread, !first.resolved)}
        >
          {resolving ? <Spinner className="size-3" /> : null}
          {first.resolved ? resolveLabels[0] : resolveLabels[1]}
        </Button>
      ) : null}
    </div>
  );
}

function PatchView({
  file,
  discussions,
  target,
  drafts,
  onTarget,
  onAddDraft,
  onCancelDraft,
  onResolve,
  canResolve,
  resolvingThreadId,
  reveal,
  canComment,
}: {
  file: ForgeReviewFile;
  discussions: ForgeReviewInspection["discussions"];
  target: CommentTarget | null;
  drafts: readonly StoredForgeReviewDraft[];
  onTarget: (target: CommentTarget) => void;
  onAddDraft: (draft: DraftInput) => void;
  onCancelDraft: () => void;
  onResolve: (thread: ReviewThread, resolved: boolean) => void;
  canResolve: boolean;
  resolvingThreadId: string | null;
  reveal: RevealLocation | null;
  canComment: boolean;
}) {
  const frame = useRef<HTMLDivElement>(null);
  const [layoutPreference, setLayoutPreference] = useState<"auto" | "split" | "unified">("auto");
  const [narrow, setNarrow] = useState(false);
  useEffect(() => {
    if (!frame.current || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(([entry]) => {
      if (entry) setNarrow(entry.contentRect.width < 640);
    });
    observer.observe(frame.current);
    return () => observer.disconnect();
  }, [file.path]);
  const unified = layoutPreference === "unified" || (layoutPreference === "auto" && narrow);
  const rows = useMemo(
    () => (unified ? reviewUnifiedDiffRows(file.patch) : reviewSplitDiffRows(file.patch))
      .filter((row) => row.kind !== "meta"),
    [file.patch, unified],
  );
  const scrollRoot = useRef<HTMLDivElement>(null);
  const [wrapLines, setWrapLines] = useState(true);
  const threads = useMemo(
    () => discussionThreads(discussions).filter((thread) => thread.messages[0]?.path === file.path),
    [discussions, file.path],
  );
  const threadsByPosition = useMemo(() => {
    const positions = new Map<string, ReviewThread[]>();
    for (const thread of threads) {
      const first = thread.messages[0];
      if (!first?.line || first.outdated) continue;
      const key = `${first.side ?? "new"}:${first.line}`;
      positions.set(key, [...(positions.get(key) ?? []), thread]);
    }
    return positions;
  }, [threads]);
  const draftsByPosition = useMemo(() => {
    const positions = new Map<string, StoredForgeReviewDraft[]>();
    for (const draft of drafts) {
      if (draft.path !== file.path || !draft.line || !draft.side) continue;
      const key = `${draft.side}:${draft.line}`;
      positions.set(key, [...(positions.get(key) ?? []), draft]);
    }
    return positions;
  }, [drafts, file.path]);
  const layout = file.status === "added" ? "head" : file.status === "deleted" ? "base" : "split";
  const [visibleRows, setVisibleRows] = useState(2_000);
  useEffect(() => setVisibleRows(2_000), [file.path, unified]);
  useEffect(() => {
    if (!reveal || reveal.path !== file.path) return;
    const index = rows.findIndex((row) => row.kind === "content" &&
      (reveal.side === "old" ? row.old?.line === reveal.line : reveal.side === "new" ? row.new?.line === reveal.line : row.new?.line === reveal.line || row.old?.line === reveal.line));
    if (index < 0) return;
    if (index >= visibleRows) { setVisibleRows(index + 100); return; }
    const element = scrollRoot.current?.querySelector(`[id="review-line-${reveal.side ?? "new"}-${reveal.line}"]`) ??
      scrollRoot.current?.querySelector(`[id="review-line-old-${reveal.line}"]`);
    element?.scrollIntoView?.({ block: "center", inline: "nearest" });
  }, [file.path, reveal, rows, visibleRows]);
  const renderedRows = rows.slice(0, visibleRows);
  const hasContent = rows.some((row) => row.kind === "content");
  const renderCell = (cell: ReviewSplitDiffCell | null, side: "old" | "new", otherLine?: number) => {
    if (!cell) {
      return <div aria-hidden className={cn("min-h-5", SPACER_HATCH)} />;
    }
    const active = target?.path === file.path && target.line === cell.line && target.side === side;
    const lineDrafts = draftsByPosition.get(`${side}:${cell.line}`) ?? [];
    // Older provider payloads did not include a side. They represented the
    // current/new line, so they are indexed on the head side without being
    // duplicated in both columns for unchanged context lines.
    const lineThreads = threadsByPosition.get(`${side}:${cell.line}`) ?? [];
    const changed = cell.kind === "added" || cell.kind === "removed";
    return (
      <div id={`review-line-${side}-${cell.line}`}>
        <div
          className={cn(
            "group grid min-h-5 w-full",
            unified ? "grid-cols-[3px_20px_36px_36px_minmax(0,1fr)]" : "grid-cols-[3px_20px_36px_minmax(0,1fr)]",
            cell.kind === "added" && LINE_ADDED,
            cell.kind === "removed" && LINE_REMOVED,
          )}
        >
          <span
            aria-hidden
            className={cn(
              cell.kind === "added" && GUTTER_ADDED,
              cell.kind === "removed" && GUTTER_REMOVED,
            )}
          />
          <span className="flex items-center justify-center">
            <button
              type="button"
              disabled={!canComment}
              aria-label={`Add comment at ${file.path}:${cell.line} (${side} line)`}
              onClick={() => onTarget({ path: file.path, line: cell.line, side })}
              className={cn(
                "flex size-4 items-center justify-center rounded-sm text-primary outline-none transition-opacity hover:bg-primary/10 focus-visible:ring-2 focus-visible:ring-ring/35",
                active
                  ? "opacity-100"
                  : "opacity-0 group-hover:opacity-100 group-focus-within:opacity-100",
              )}
            >
              <HugeiconsIcon icon={CommentAdd01Icon} size={13} strokeWidth={1.9} />
            </button>
          </span>
          <span className="select-none pr-2 text-right tabular-nums text-muted-foreground">
            {unified && side === "new" ? otherLine : cell.line}
          </span>
          {unified ? (
            <span className="select-none pr-2 text-right tabular-nums text-muted-foreground">
              {side === "new" ? cell.line : otherLine}
            </span>
          ) : null}
          <span className={cn("min-w-0 pl-2 pr-3", wrapLines ? "whitespace-pre-wrap [overflow-wrap:anywhere]" : "overflow-x-auto whitespace-pre")}>
            <span aria-hidden className="mr-2 inline-block w-2 select-none text-muted-foreground/70">
              {cell.kind === "added" ? "+" : cell.kind === "removed" ? "−" : " "}
            </span>
            <span className={cn(!changed && "text-foreground/85")}>{cell.text || " "}</span>
          </span>
        </div>
        {active && target ? (
          <DraftComposer target={target} onCancel={onCancelDraft} onAdd={onAddDraft} />
        ) : null}
        {lineThreads.map((thread) => {
          const first = thread.messages[0];
          if (!first) return null;
          const replying = Boolean(thread.replyToId && target?.replyToId === thread.replyToId);
          return (
            <article
              key={thread.key}
              className="border-y border-border/60 bg-muted/[0.18] px-3 py-2.5 font-sans"
              aria-label={`Review conversation at ${file.path}:${cell.line}`}
            >
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
                <span className="font-semibold text-foreground">{first.author}</span>
                <time dateTime={first.createdAt ?? undefined}>{reviewTime(first.createdAt)}</time>
                <ThreadStateBadges resolved={first.resolved} outdated={first.outdated} />
              </div>
              <div className="mt-1.5 divide-y divide-border/60">
                {thread.messages.map((message, index) => (
                  <div key={message.id ?? `${thread.key}:${index}`} className="py-1.5 first:pt-0 last:pb-0">
                    {index > 0 ? (
                      <div className="mb-1 flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
                        <span className="font-semibold text-foreground">{message.author}</span>
                        <time dateTime={message.createdAt ?? undefined}>{reviewTime(message.createdAt)}</time>
                      </div>
                    ) : null}
                    <p className="whitespace-pre-wrap text-xs leading-5 text-foreground">{message.body}</p>
                  </div>
                ))}
              </div>
              {replying && target ? (
                <div className="mt-2">
                  <DraftComposer target={target} onCancel={onCancelDraft} onAdd={onAddDraft} />
                </div>
              ) : (
                <ThreadActions
                  thread={thread}
                  side={side}
                  onTarget={onTarget}
                  onResolve={onResolve}
                  canResolve={canResolve}
                  resolvingThreadId={resolvingThreadId}
                  resolveLabels={["Reopen", "Resolve"]}
                  canReply={Boolean(thread.replyToId)}
                />
              )}
            </article>
          );
        })}
        {lineDrafts.map((draft) => (
          <div
            key={draft.id}
            className="border-y border-primary/20 bg-primary/[0.045] px-3 py-2 font-sans"
          >
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Badge variant="secondary" className="h-4 rounded-[6px] px-1.5 text-xs">
                Local draft
              </Badge>
              <time dateTime={draft.createdAt}>{reviewTime(draft.createdAt)}</time>
            </div>
            <p className="mt-1 whitespace-pre-wrap text-xs leading-5 text-foreground">
              {draft.body}
            </p>
          </div>
        ))}
      </div>
    );
  };
  if (!hasContent) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-1 px-6 text-center">
        <p className="text-sm font-medium text-foreground">
          {file.status === "binary" ? "Binary file" : "No text diff"}
        </p>
        <p className="max-w-sm text-xs text-muted-foreground">
          {file.status === "binary"
            ? "The provider reports a binary change for this file. Open the review in the browser to inspect it."
            : "The provider did not return a patch for this file."}
        </p>
      </div>
    );
  }
  return (
    <div ref={frame} className="flex min-h-0 min-w-0 flex-1 flex-col bg-background">
      <div className="flex min-h-8 shrink-0 flex-wrap items-center justify-between gap-1 border-b border-border/60 px-2 py-1">
        <div role="group" aria-label="Diff layout" className="flex items-center gap-0.5">
          {(["auto", "split", "unified"] as const).map((mode) => (
            <Button key={mode} size="xs" variant={layoutPreference === mode ? "secondary" : "ghost"}
              aria-pressed={layoutPreference === mode} onClick={() => setLayoutPreference(mode)}
              title={mode === "auto" ? "Use a unified diff when the pane is narrow" : undefined}>
              {mode === "auto" ? "Auto" : mode === "split" ? "Split" : "Unified"}
            </Button>
          ))}
        </div>
        <Button size="xs" variant={wrapLines ? "secondary" : "ghost"} aria-pressed={wrapLines} onClick={() => setWrapLines((wrap) => !wrap)}>Wrap lines</Button>
      </div>
      <div ref={scrollRoot} className="min-h-0 min-w-0 flex-1 overflow-auto overscroll-contain">
        <div className="w-full min-w-0 font-mono text-xs leading-5">
          <div
            className={cn(
              "sticky top-0 z-10 grid h-7 min-w-full border-b border-border/60 bg-background text-xs font-medium text-muted-foreground",
              layout === "split" && !unified ? "grid-cols-2" : "grid-cols-1",
            )}
          >
            {unified ? <span className="flex items-center px-3">{layout === "head" ? "Head" : layout === "base" ? "Base" : "Base → Head"}</span> : null}
            {!unified && layout !== "head" ? (
              <span
                className={cn(
                  "flex items-center",
                  layout === "split" && "border-r border-border/60",
                )}
              >
                <span className="sticky left-0 px-3">Base</span>
              </span>
            ) : null}
            {!unified && layout !== "base" ? (
              <span className="flex items-center">
                <span className="sticky left-0 px-3">Head</span>
              </span>
            ) : null}
          </div>
          {renderedRows.map((row) =>
            row.kind === "content" ? (
              <div
                key={row.key}
                className={cn(
                  "grid min-w-full",
                  layout === "split" && !unified ? "grid-cols-2" : "grid-cols-1",
                )}
              >
                {unified ? (
                  <div className="min-w-0">
                    {row.old && (!row.new || threadsByPosition.has(`old:${row.old.line}`) ||
                      draftsByPosition.has(`old:${row.old.line}`) ||
                      (target?.side === "old" && target.line === row.old.line))
                      ? renderCell(row.old, "old", row.new?.line) : null}
                    {row.new ? renderCell(row.new, "new", row.old?.line) : null}
                  </div>
                ) : (
                  <>
                    {layout !== "head" ? (
                      <div className={cn("min-w-0", layout === "split" && "border-r border-border/60")}>
                        {renderCell(row.old, "old")}
                      </div>
                    ) : null}
                    {layout !== "base" ? (
                      <div className="min-w-0">{renderCell(row.new, "new")}</div>
                    ) : null}
                  </>
                )}
              </div>
            ) : (
              <div
                key={row.key}
                className={cn(
                  "min-w-0 break-words border-y border-border/40 px-3 py-0.5 text-muted-foreground",
                  row.kind === "hunk" ? "bg-muted/40" : "bg-muted/20",
                )}
              >
                {row.text || " "}
              </div>
            ),
          )}
        </div>
      </div>
      {visibleRows < rows.length ? (
        <div className="flex shrink-0 items-center justify-center gap-3 border-t border-border/60 bg-background px-3 py-2">
          <span className="text-xs tabular-nums text-muted-foreground">
            {(rows.length - visibleRows).toLocaleString()} more lines
          </span>
          <Button
            size="xs"
            variant="outline"
            onClick={() => setVisibleRows((count) => Math.min(count + 2_000, rows.length))}
          >
            Show {Math.min(2_000, rows.length - visibleRows).toLocaleString()} more
          </Button>
        </div>
      ) : null}
    </div>
  );
}

function DraftQueue({
  drafts,
  publishing,
  canPublish,
  onRemove,
  onUpdate,
  onReveal,
  onClose,
  onPublish,
}: {
  drafts: readonly StoredForgeReviewDraft[];
  publishing: boolean;
  canPublish: boolean;
  onRemove: (id: string) => void;
  onUpdate: (id: string, body: string) => void;
  onReveal: (draft: StoredForgeReviewDraft) => void;
  onClose: () => void;
  onPublish: () => void;
}) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editBody, setEditBody] = useState("");
  return (
    <aside
      className="flex h-56 min-h-0 w-full shrink-0 flex-col border-t border-border/60 bg-muted/[0.12] @[1050px]:h-auto @[1050px]:w-72 @[1050px]:border-l @[1050px]:border-t-0"
      aria-label="Local review queue"
    >
      <div className="flex h-9 shrink-0 items-center gap-2 border-b border-border/60 px-3">
        <h2 className="text-xs font-semibold">Review queue</h2>
        <span className="inline-flex h-4 min-w-4 items-center justify-center rounded-full border border-border/60 px-1 text-xs font-semibold tabular-nums text-muted-foreground">
          {drafts.length}
        </span>
        <Badge variant="secondary" className="h-4 rounded-[6px] px-1.5 text-xs">
          Local only
        </Badge>
        <Button
          size="icon-xs"
          variant="ghost"
          className="ml-auto text-muted-foreground hover:text-foreground"
          aria-label="Close review queue"
          onClick={onClose}
        >
          <HugeiconsIcon icon={Cancel01Icon} size={12} />
        </Button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto">
        {drafts.map((draft, index) => {
          const location = draft.replyToAuthor
            ? `Reply to @${draft.replyToAuthor}`
            : draft.path
              ? `${draft.path}${draft.line ? `:${draft.line}` : ""}`
              : "Overall review comment";
          const editing = editingId === draft.id;
          return (
            <article key={draft.id} className="group border-b border-border/60 px-3 py-2.5">
              <div className="flex items-start gap-1">
                <button
                  type="button"
                  className="min-w-0 flex-1 rounded-sm text-left outline-none focus-visible:ring-2 focus-visible:ring-ring/35"
                  onClick={() => onReveal(draft)}
                  title={location}
                >
                  <span
                    className={cn(
                      "block truncate text-xs font-medium text-foreground",
                      draft.path && !draft.replyToAuthor && "font-mono",
                    )}
                  >
                    {location}
                  </span>
                  <time
                    dateTime={draft.createdAt}
                    className="mt-0.5 block text-xs text-muted-foreground"
                  >
                    Draft {index + 1} · {reviewTime(draft.createdAt)}
                  </time>
                </button>
                <div className="flex shrink-0 items-center opacity-60 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        size="icon-xs"
                        variant="ghost"
                        className="text-muted-foreground hover:text-foreground"
                        aria-label={`Edit draft ${index + 1}`}
                        aria-pressed={editing}
                        onClick={() => {
                          if (editing) {
                            setEditingId(null);
                            return;
                          }
                          setEditingId(draft.id);
                          setEditBody(draft.body);
                        }}
                      >
                        <HugeiconsIcon icon={Edit02Icon} size={12} />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent side="bottom">Edit draft</TooltipContent>
                  </Tooltip>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        size="icon-xs"
                        variant="ghost"
                        className="text-muted-foreground hover:text-destructive"
                        aria-label={`Remove draft ${index + 1}`}
                        onClick={() => {
                          if (editing) setEditingId(null);
                          onRemove(draft.id);
                        }}
                      >
                        <HugeiconsIcon icon={Cancel01Icon} size={12} />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent side="bottom">Remove draft</TooltipContent>
                  </Tooltip>
                </div>
              </div>
              {editing ? (
                <div className="mt-2">
                  <Textarea
                    autoFocus
                    value={editBody}
                    onChange={(event) => setEditBody(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === "Escape") {
                        event.preventDefault();
                        setEditingId(null);
                      }
                      if (event.key === "Enter" && (event.metaKey || event.ctrlKey) && editBody.trim()) {
                        event.preventDefault();
                        onUpdate(draft.id, editBody.trim());
                        setEditingId(null);
                      }
                    }}
                    className="min-h-24 resize-y bg-background text-sm"
                    aria-label={`Draft ${index + 1} body`}
                  />
                  <div className="mt-2 flex justify-end gap-1.5">
                    <Button size="xs" variant="ghost" onClick={() => setEditingId(null)}>
                      Cancel
                    </Button>
                    <Button
                      size="xs"
                      disabled={!editBody.trim()}
                      onClick={() => {
                        onUpdate(draft.id, editBody.trim());
                        setEditingId(null);
                      }}
                    >
                      Save draft
                    </Button>
                  </div>
                </div>
              ) : (
                <p className="mt-1.5 whitespace-pre-wrap text-xs leading-5">{draft.body}</p>
              )}
            </article>
          );
        })}
      </div>
      <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-t border-border/60 p-3 @[1050px]:flex-col">
        <p className="text-xs text-muted-foreground">
          Nothing is shared until you confirm.
        </p>
        <Button className="ml-auto @[1050px]:w-full" size="sm" disabled={!canPublish || publishing} onClick={onPublish}>
          {publishing ? <Spinner className="size-3" /> : null}
          Submit review · {drafts.length}
        </Button>
      </div>
    </aside>
  );
}

function ConversationView({
  discussions,
  mode,
  target,
  onTarget,
  onAddDraft,
  onCancelDraft,
  onRevealLocation,
  onResolve,
  canResolve,
  resolvingThreadId,
}: {
  discussions: ForgeReviewInspection["discussions"];
  mode: "conversations" | "history";
  target: CommentTarget | null;
  onTarget: (target: CommentTarget) => void;
  onAddDraft: (draft: DraftInput) => void;
  onCancelDraft: () => void;
  onRevealLocation: (path: string, line: number | null) => void;
  onResolve: (thread: ReviewThread, resolved: boolean) => void;
  canResolve: boolean;
  resolvingThreadId: string | null;
}) {
  const threads = useMemo(
    () =>
      discussionThreads(discussions).filter((thread) =>
        mode === "history"
          ? thread.messages[0]?.kind === "system"
          : thread.messages[0]?.kind !== "system",
      ),
    [discussions, mode],
  );
  if (threads.length === 0) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-1 px-6 text-center">
        <p className="text-sm font-medium text-foreground">
          {mode === "history" ? "No activity yet" : "No conversations yet"}
        </p>
        <p className="max-w-sm text-xs leading-5 text-muted-foreground">
          {mode === "history"
            ? "Review requests, approvals, and other provider events will appear here."
            : "Hover a line in Changes to comment on it, or add an overall comment from the toolbar."}
        </p>
      </div>
    );
  }
  return (
    <div className="min-h-0 flex-1 overflow-y-auto">
      <div className="px-5 py-4">
        <div className="mb-2 flex items-center gap-2">
          <h2 className="text-sm font-semibold">
            {mode === "history" ? "Review history" : "Conversations"}
          </h2>
          <span className="inline-flex h-4 min-w-4 items-center justify-center rounded-full border border-border/60 px-1 text-xs font-semibold tabular-nums text-muted-foreground">
            {threads.length}
          </span>
        </div>
        <div className="divide-y divide-border/60 border-y border-border/60">
          {threads.map((thread) => {
            const first = thread.messages[0];
            if (!first) return null;
            const replying = target?.conversationKey === thread.key;
            return (
              <article key={thread.key} className="py-4">
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
                  {first.path ? (
                    <button
                      type="button"
                      className="rounded-sm font-mono font-medium text-primary outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring/35"
                      onClick={() => onRevealLocation(first.path!, first.line)}
                    >
                      {first.path}
                      {first.line ? `:${first.line}` : ""}
                    </button>
                  ) : (
                    <span className="font-medium text-muted-foreground">
                      {first.kind === "review"
                        ? "Review"
                        : first.kind === "system"
                          ? "Activity"
                          : "General discussion"}
                    </span>
                  )}
                  {first.state ? (
                    <Badge
                      variant="secondary"
                      className={cn("h-4 rounded-[6px] px-1.5 text-xs", statusTone(first.state))}
                    >
                      {humanize(first.state)}
                    </Badge>
                  ) : null}
                  {first.kind !== "system" ? (
                    <ThreadStateBadges resolved={first.resolved} outdated={first.outdated} />
                  ) : null}
                </div>
                <div className="mt-2 divide-y divide-border/60 border-l border-border/60 pl-3">
                  {thread.messages.map((message, index) => (
                    <div key={message.id ?? `${thread.key}:${index}`} className="py-2 first:pt-0 last:pb-0">
                      <div className="flex flex-wrap items-baseline gap-x-2 text-xs">
                        <span className="font-semibold text-foreground">{message.author}</span>
                        <time dateTime={message.createdAt ?? undefined} className="text-muted-foreground">
                          {reviewTime(message.createdAt)}
                        </time>
                        {message.kind === "review" && message.state ? (
                          <span className={statusTone(message.state)}>{humanize(message.state)}</span>
                        ) : null}
                      </div>
                      <p className="mt-1 whitespace-pre-wrap text-sm leading-6">{message.body}</p>
                    </div>
                  ))}
                </div>
                {mode === "conversations" ? (
                  replying && target ? (
                    <div className="mt-3">
                      <DraftComposer target={target} onCancel={onCancelDraft} onAdd={onAddDraft} />
                    </div>
                  ) : (
                    <ThreadActions
                      thread={thread}
                      side={first.side ?? null}
                      onTarget={onTarget}
                      onResolve={onResolve}
                      canResolve={canResolve}
                      resolvingThreadId={resolvingThreadId}
                      resolveLabels={["Reopen conversation", "Resolve conversation"]}
                      canReply
                    />
                  )
                ) : null}
              </article>
            );
          })}
        </div>
      </div>
    </div>
  );
}

export function ReviewSurface({
  tabs,
  activeId,
  surfaceVisible,
  runtime,
  forge,
  sessions,
  desktop,
}: UiTabSurfaceProps & {
  forge: ForgeReviewsCapability;
  sessions(): AiSessionsCapability | undefined;
  desktop(): DesktopIntegrationCapability | undefined;
}) {
  const activeTab = tabs.find((tab) => tab.id === activeId);
  const data = activeTab ? forgeReviewTabData(activeTab) : null;
  const reviewIdentity = data
    ? `${data.repository.host}/${data.repository.slug}#${data.review.number}`
    : "";
  const [inspection, setInspection] = useState<ForgeReviewInspection | null>(null);
  const [loadedAt, setLoadedAt] = useState<Date | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [view, setView] = useState<ReviewView>("changes");
  const [filesOpen, setFilesOpen] = useState(true);
  const [fileFilter, setFileFilter] = useState<FileFilter>("all");
  const [selectedPath, setSelectedPath] = useState<string | null>(null);
  const [commentTarget, setCommentTarget] = useState<CommentTarget | null>(null);
  const [publishOpen, setPublishOpen] = useState(false);
  const [publishDrafts, setPublishDrafts] = useState<readonly StoredForgeReviewDraft[]>([]);
  const [publishTarget, setPublishTarget] = useState<{ key: string; headSha: string } | null>(null);
  const [reveal, setReveal] = useState<RevealLocation | null>(null);
  const lastOpenThread = useRef<string | null>(null);
  const [draftsExpanded, setDraftsExpanded] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [publishError, setPublishError] = useState<string | null>(null);
  const [retryPending, setRetryPending] = useState(false);
  const [publishNotice, setPublishNotice] = useState<string | null>(null);
  const [reviewOutcome, setReviewOutcome] = useState<ForgeReviewOutcome>("comment");
  const [reviewSummary, setReviewSummary] = useState("");
  const [resolvingThreadId, setResolvingThreadId] = useState<string | null>(null);
  const [conversationError, setConversationError] = useState<string | null>(null);
  const requestRevision = useRef(0);
  const previousDraftCount = useRef(0);
  const activeRigId = activeTab?.rigId;
  const workspace = useMemo(
    () => (activeRigId ? runtime.workspaceForRig(activeRigId) : runtime.workspace),
    [activeRigId, runtime],
  );

  useEffect(() => {
    requestRevision.current += 1;
    previousDraftCount.current = 0;
    setInspection(null);
    setReveal(null);
    lastOpenThread.current = null;
    setPublishDrafts([]);
    setLoadedAt(null);
    setSelectedPath(null);
    setCommentTarget(null);
    setPublishOpen(false);
    setDraftsExpanded(false);
    setPublishError(null);
    setRetryPending(false);
    setPublishNotice(null);
    setConversationError(null);
    setReviewOutcome("comment");
    setReviewSummary("");
    setFileFilter("all");
    setError(null);
    setView("changes");
  }, [reviewIdentity]);

  useEffect(() => {
    if (!publishNotice) return;
    const timer = window.setTimeout(() => setPublishNotice(null), 6_000);
    return () => window.clearTimeout(timer);
  }, [publishNotice]);

  const load = useCallback(
    async (refresh: boolean) => {
      if (!data) return;
      const revision = ++requestRevision.current;
      setLoading(true);
      setError(null);
      try {
        const value = await forge.inspect({
          repository: data.repository,
          workspace,
          number: data.review.number,
          refresh,
        });
        if (revision !== requestRevision.current) return;
        setInspection(value);
        setLoadedAt(new Date());
        setSelectedPath((current) =>
          value.files.some((file) => file.path === current)
            ? current
            : (value.files[0]?.path ?? null),
        );
      } catch (cause) {
        if (revision === requestRevision.current) {
          setError(cause instanceof Error ? cause.message : String(cause));
        }
      } finally {
        if (revision === requestRevision.current) setLoading(false);
      }
    },
    [data, forge, workspace],
  );

  useEffect(() => {
    if (surfaceVisible && data) void load(false);
    return () => {
      requestRevision.current += 1;
    };
  }, [data, load, surfaceVisible]);

  const headSha = inspection?.summary.headSha ?? data?.review.headSha ?? null;
  const draftKey =
    data && headSha
      ? reviewDraftKey({
          host: data.repository.host,
          slug: data.repository.slug,
          number: data.review.number,
          headSha,
        })
      : null;
  const drafts = useSyncExternalStore(
    forgeReviewDrafts.subscribe,
    () => forgeReviewDrafts.snapshot(draftKey ?? ""),
    () => forgeReviewDrafts.snapshot(draftKey ?? ""),
  );

  const draftRevision = useSyncExternalStore(forgeReviewDrafts.subscribe, forgeReviewDrafts.revision, forgeReviewDrafts.revision);
  const earlierDrafts = useMemo(() => draftKey ? forgeReviewDrafts.earlierRevisions(draftKey) : [], [draftKey, draftRevision]);
  const earlierDraftCount = earlierDrafts.reduce((total, group) => total + group.drafts.length, 0);

  // Open the queue when the first draft of a review lands; afterwards the
  // user's own toggle wins so the diff column stops reflowing on every draft.
  useEffect(() => {
    if (drafts.length > 0 && previousDraftCount.current === 0) setDraftsExpanded(true);
    previousDraftCount.current = drafts.length;
  }, [drafts.length]);

  const selectedFile = inspection?.files.find((file) => file.path === selectedPath) ?? null;
  const threads = useMemo(
    () => discussionThreads(inspection?.discussions ?? []),
    [inspection?.discussions],
  );
  const humanThreads = useMemo(
    () => threads.filter((thread) => thread.messages[0]?.kind !== "system"),
    [threads],
  );
  const historyThreads = useMemo(
    () => threads.filter((thread) => thread.messages[0]?.kind === "system"),
    [threads],
  );
  const openThreads = useMemo(() => humanThreads.filter(isOpenThread), [humanThreads]);
  const navigableOpenThreads = useMemo(
    () =>
      openThreads.filter((thread) => {
        const first = thread.messages[0];
        return Boolean(first?.path && first.line && !first.outdated);
      }),
    [openThreads],
  );
  const fileThreadCounts = useMemo(() => {
    const counts = new Map<string, { total: number; open: number }>();
    for (const thread of humanThreads) {
      const path = thread.messages[0]?.path;
      if (!path) continue;
      const entry = counts.get(path) ?? { total: 0, open: 0 };
      entry.total += 1;
      if (isOpenThread(thread)) entry.open += 1;
      counts.set(path, entry);
    }
    return counts;
  }, [humanThreads]);
  const filterCounts = useMemo<Record<FileFilter, number>>(() => {
    const files = inspection?.files ?? [];
    return {
      all: files.length,
      commented: files.filter((file) => (fileThreadCounts.get(file.path)?.total ?? 0) > 0).length,
      open: files.filter((file) => (fileThreadCounts.get(file.path)?.open ?? 0) > 0).length,
    };
  }, [fileThreadCounts, inspection?.files]);
  const visibleFiles = useMemo(
    () =>
      (inspection?.files ?? []).filter((file) => {
        if (fileFilter === "all") return true;
        const counts = fileThreadCounts.get(file.path);
        return fileFilter === "commented" ? (counts?.total ?? 0) > 0 : (counts?.open ?? 0) > 0;
      }),
    [fileFilter, fileThreadCounts, inspection?.files],
  );

  useEffect(() => {
    if (!inspection || visibleFiles.some((file) => file.path === selectedPath)) return;
    setSelectedPath(visibleFiles[0]?.path ?? null);
  }, [fileFilter, inspection, selectedPath, visibleFiles]);

  if (!data || !activeTab) return null;
  const reviewUrl = safeReviewUrl(data.repository.host, inspection?.summary.url ?? data.review.url);
  const canResolve = Boolean(forge.setThreadResolved && data.repository.features.resolveThreads);
  const reviewTitle = inspection?.summary.title ?? data.review.title;
  const askAi = () => {
    const ai = sessions();
    if (!ai) return;
    startReviewConversation(ai, {
      repository: data.repository,
      review: data.review,
      rigId: activeTab.rigId,
      exactHeadSha: headSha,
    });
  };
  const addDraft = (draft: DraftInput) => {
    const { conversationKey: _conversationKey, ...storedDraft } = draft;
    if (draftKey) forgeReviewDrafts.add(draftKey, storedDraft);
    setCommentTarget(null);
  };
  const changeView = (next: ReviewView) => {
    setView(next);
    // A line or thread target belongs to the view it was opened in.
    if (commentTarget && (commentTarget.path !== null || commentTarget.conversationKey)) {
      setCommentTarget(null);
    }
  };
  const revealLocation = (path: string, line: number | null, side?: "new" | "old" | null) => {
    setView("changes");
    setFileFilter("all");
    setSelectedPath(path);
    setCommentTarget(null);
    if (line) setReveal((current) => ({ path, line, side, revision: (current?.revision ?? 0) + 1 }));
  };
  const revealNextOpenConversation = () => {
    if (navigableOpenThreads.length === 0) return;
    const currentIndex = navigableOpenThreads.findIndex((thread) => thread.key === lastOpenThread.current);
    const next = navigableOpenThreads[(currentIndex + 1) % navigableOpenThreads.length];
    lastOpenThread.current = next.key;
    const first = next.messages[0];
    if (first?.path) revealLocation(first.path, first.line, first.side);
  };
  const resolveConversation = async (thread: ReviewThread, resolved: boolean) => {
    const threadId = thread.messages[0]?.threadId;
    if (!threadId || !forge.setThreadResolved || !data) return;
    setResolvingThreadId(threadId);
    setConversationError(null);
    try {
      await forge.setThreadResolved({
        repository: data.repository,
        workspace,
        number: data.review.number,
        threadId,
        resolved,
      });
      await load(true);
    } catch (cause) {
      setConversationError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setResolvingThreadId(null);
    }
  };
  const openPublishDialog = () => {
    setPublishDrafts([...drafts]);
    setPublishTarget(draftKey && headSha ? { key: draftKey, headSha } : null);
    setPublishError(null);
    setPublishOpen(true);
  };
  const publish = async () => {
    if (!publishTarget) return;
    setPublishing(true);
    setPublishError(null);
    try {
      const base = {
        repository: data.repository,
        workspace,
        number: data.review.number,
        expectedHeadSha: publishTarget.headSha,
        comments: publishDrafts.map(({ id: _id, createdAt: _createdAt, ...draft }) => draft),
      } as const;
      const result =
        forge.submitReview
          ? await forge.submitReview({ ...base, outcome: reviewOutcome, summary: reviewSummary })
          : await forge.publishComments(base);
      // Only remove drafts included in this request; AI may add more while
      // publication is in flight. Keep original timestamps/IDs on failures.
      const remainingSubmitted = forgeReviewDrafts.reconcile(publishTarget.key, publishDrafts, result.remaining);
      setPublishDrafts(remainingSubmitted);
      if ("summarySubmitted" in result && result.summarySubmitted) setReviewSummary("");
      if (result.error || result.remaining.length > 0) {
        setRetryPending(true);
        setPublishError(
          `${result.published} of ${publishDrafts.length} comments published. ${result.error ?? "Some comments are still pending."} Retry continues with the remaining feedback and review outcome.`,
        );
        return;
      }
      setPublishOpen(false);
      setPublishNotice(
        retryPending
          ? `Review completed on ${data.repository.providerLabel}.`
          : `${reviewOutcome === "comment" ? "Review" : OUTCOME_LABELS[reviewOutcome]} submitted to ${data.repository.providerLabel} for head ${shortSha(headSha)}.`,
      );
      setRetryPending(false);
      setReviewSummary("");
      setReviewOutcome("comment");
      await load(true);
    } catch (cause) {
      setPublishError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setPublishing(false);
    }
  };

  const queueOpen = drafts.length > 0 && draftsExpanded;
  const reviewStatus = inspection?.summary.reviewStatus ?? null;
  const isDraft = inspection?.summary.draft ?? data.review.draft;
  const forkSource =
    inspection?.sourceRepository && inspection.sourceRepository !== inspection.targetRepository
      ? inspection.sourceRepository
      : null;
  const unsupportedOutcomes = (["approve", "request_changes"] as const).filter(
    (outcome) =>
      (outcome === "approve" && !data.repository.features.approve) ||
      (outcome === "request_changes" && !data.repository.features.requestChanges),
  );
  const submitLabel = retryPending
    ? "Retry review"
    : reviewOutcome === "comment"
      ? "Submit review"
      : OUTCOME_LABELS[reviewOutcome];
  const submitDisabled =
    publishing ||
    (!retryPending && reviewOutcome === "request_changes" && !reviewSummary.trim()) ||
    (!retryPending && reviewOutcome === "comment" && publishDrafts.length === 0 && !reviewSummary.trim());

  return (
    <div className="@container relative flex h-full min-h-0 flex-col bg-background text-foreground [contain:layout_style]">
      <header className="termco-toolbar shrink-0 border-b border-border/60 px-4 py-2.5">
        <div className="flex min-w-0 items-start gap-4">
          <div className="min-w-0 flex-1">
            <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
              <span className="font-medium text-foreground">{data.repository.providerLabel}</span>
              <span className="truncate">{data.repository.slug}</span>
              <span className="tabular-nums">#{data.review.number}</span>
              {isDraft ? (
                <Badge variant="secondary" className="h-4 rounded-[6px] px-1.5 text-xs">
                  Draft
                </Badge>
              ) : null}
              {reviewStatus ? (
                <Badge
                  variant="secondary"
                  className={cn("h-4 rounded-[6px] px-1.5 text-xs", statusTone(reviewStatus))}
                >
                  {humanize(reviewStatus)}
                </Badge>
              ) : null}
              {inspection && openThreads.length > 0 ? (
                <Badge asChild variant="outline" className="h-4 rounded-[6px] px-1.5 text-xs">
                  <button
                    type="button"
                    className="outline-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring/35"
                    onClick={() => changeView("conversations")}
                  >
                    <span className="tabular-nums">{openThreads.length}</span> open{" "}
                    {openThreads.length === 1 ? "conversation" : "conversations"}
                  </button>
                </Badge>
              ) : null}
            </div>
            <h1 className="mt-1 truncate text-sm font-semibold" title={reviewTitle}>
              {reviewTitle}
            </h1>
            <div className="mt-1.5 flex min-w-0 items-center gap-1.5 font-mono text-xs text-muted-foreground">
              <HugeiconsIcon icon={GitBranchIcon} size={13} className="shrink-0" />
              <span className="min-w-0 truncate">
                {forkSource ? `${forkSource}:` : ""}
                {inspection?.headRef ?? "head"}
              </span>
              <span aria-hidden className="shrink-0">
                →
              </span>
              <span className="min-w-0 truncate">
                {forkSource ? `${inspection?.targetRepository}:` : ""}
                {inspection?.baseRef ?? "base"}
              </span>
              <span className={cn("ml-1 shrink-0", SHA_CHIP)} title={headSha ?? undefined}>
                head {shortSha(headSha)}
              </span>
              <span className={cn("shrink-0", SHA_CHIP)} title={inspection?.baseSha ?? undefined}>
                base {shortSha(inspection?.baseSha ?? null)}
              </span>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-1">
            <Tooltip>
              <TooltipTrigger asChild>
                <span>
                  <Button size="xs" variant="outline" disabled={!sessions()} onClick={askAi}>
                    <HugeiconsIcon icon={AiChat01Icon} size={13} /> Ask AI
                  </Button>
                </span>
              </TooltipTrigger>
              <TooltipContent>
                {sessions()
                  ? "Start a reviewer chat pinned to this exact head"
                  : "AI chat is not available in this workspace"}
              </TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  size="icon-xs"
                  variant="ghost"
                  disabled={loading}
                  aria-label="Refresh review"
                  onClick={() => void load(true)}
                >
                  {loading ? (
                    <Spinner className="size-3" />
                  ) : (
                    <HugeiconsIcon icon={Refresh01Icon} size={13} />
                  )}
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                {loadedAt ? `Refresh review · updated ${clockTime(loadedAt)}` : "Refresh review"}
              </TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  size="icon-xs"
                  variant="ghost"
                  disabled={!reviewUrl}
                  aria-label="Open review in browser"
                  onClick={() => reviewUrl && void desktop()?.openUrl(reviewUrl)}
                >
                  <HugeiconsIcon icon={LinkSquare01Icon} size={13} />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Open in browser</TooltipContent>
            </Tooltip>
          </div>
        </div>
      </header>

      <Tabs
        value={view}
        onValueChange={(next) => changeView(next as ReviewView)}
        className="flex min-h-0 flex-1 flex-col gap-0"
      >
        <div className="termco-toolbar flex h-9 shrink-0 items-center gap-2 border-b border-border/60 pl-1 pr-2">
          <TabsList variant="line" aria-label="Review details" className="h-9">
            {(["overview", "changes", "conversations", "checks", "history"] as const).map((item) => {
              const count =
                item === "changes"
                  ? inspection?.files.length
                  : item === "checks"
                    ? inspection?.checks.length
                    : item === "conversations"
                      ? humanThreads.length
                      : item === "history"
                        ? historyThreads.length
                        : undefined;
              return (
                <TabsTrigger
                  key={item}
                  value={item}
                  className="flex-none px-2 text-xs text-muted-foreground data-active:text-primary"
                >
                  {VIEW_LABELS[item]}
                  {inspection && count !== undefined ? (
                    <>
                      {" "}
                      <span className="tabular-nums opacity-65">{count}</span>
                    </>
                  ) : null}
                </TabsTrigger>
              );
            })}
          </TabsList>
          <div className="ml-auto flex shrink-0 items-center gap-1.5">
            <Button
              size="xs"
              variant="ghost"
              aria-pressed={commentTarget?.path === null && !commentTarget.conversationKey}
              onClick={() =>
                setCommentTarget((current) =>
                  current?.path === null && !current.conversationKey
                    ? null
                    : { path: null, line: null, side: null },
                )
              }
            >
              <HugeiconsIcon icon={CommentAdd01Icon} size={12} /> Comment
            </Button>
            {drafts.length > 0 ? (
              <Button
                size="xs"
                variant={draftsExpanded ? "secondary" : "outline"}
                aria-pressed={draftsExpanded}
                onClick={() => setDraftsExpanded((expanded) => !expanded)}
              >
                Review queue <span className="tabular-nums opacity-65">{drafts.length}</span>
              </Button>
            ) : null}
            {!queueOpen ? (
              <Button size="xs" disabled={!headSha} onClick={openPublishDialog}>
                {drafts.length === 0 ? "Submit review" : `Submit review · ${drafts.length}`}
              </Button>
            ) : null}
          </div>
        </div>

        {earlierDraftCount > 0 ? (
          <details open className="shrink-0 border-b border-border/60 bg-muted/20 px-4 py-2 text-xs">
            <summary className="cursor-pointer font-medium">
              {earlierDraftCount} {earlierDraftCount === 1 ? "draft from an earlier revision" : "drafts from earlier revisions"}
            </summary>
            <p className="mt-1 text-muted-foreground">The review changed. These drafts stay local; check their locations against the new diff before using them.</p>
            <div className="mt-2 max-h-48 space-y-3 overflow-y-auto" aria-label="Earlier revision drafts">
              {earlierDrafts.flatMap((group) => group.drafts.map((draft) => (
                <article key={draft.id}>
                  <p className="mb-1 text-muted-foreground">Revision {group.headSha.slice(0, 8)} · {draft.path ? `${draft.path}${draft.line ? `:${draft.line}` : ""}` : "Overall comment"}</p>
                  <Textarea readOnly aria-label="Earlier draft feedback" value={draft.body} className="min-h-16 text-xs" />
                  <div className="mt-1 flex gap-2">
                    <Button size="xs" variant="outline" disabled={publishing} onClick={() => {
                      if (!draftKey) return;
                      forgeReviewDrafts.add(draftKey, { body: draft.body, path: null, line: null, side: null });
                      forgeReviewDrafts.remove(group.key, draft.id);
                    }}>Use as overall comment</Button>
                    <Button size="xs" variant="ghost" disabled={publishing} onClick={() => forgeReviewDrafts.remove(group.key, draft.id)}>Remove old draft</Button>
                  </div>
                </article>
              )))}
            </div>
          </details>
        ) : null}

        {publishNotice ? (
          <div
            role="status"
            className="flex shrink-0 items-center gap-2 border-b border-border/60 bg-muted/30 px-4 py-1.5 text-xs"
          >
            <HugeiconsIcon
              icon={CheckmarkCircle02Icon}
              size={13}
              className={cn("shrink-0", statusTone("success"))}
            />
            <span className="min-w-0 flex-1 truncate">{publishNotice}</span>
            <Button
              size="icon-xs"
              variant="ghost"
              aria-label="Dismiss"
              onClick={() => setPublishNotice(null)}
            >
              <HugeiconsIcon icon={Cancel01Icon} size={12} />
            </Button>
          </div>
        ) : null}

        {error && !inspection ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-2 px-6 text-center" role="alert">
            <p className="text-sm font-medium">Couldn’t load this review</p>
            <p className="max-w-md text-xs leading-5 text-muted-foreground">{error}</p>
            <Button className="mt-1" size="sm" variant="outline" onClick={() => void load(true)}>
              Retry
            </Button>
          </div>
        ) : null}
        {error && inspection ? (
          <div
            className="flex shrink-0 items-center gap-2 border-b border-destructive/30 bg-destructive/5 px-4 py-1.5 text-xs text-destructive"
            role="alert"
          >
            <span className="min-w-0 flex-1 truncate">Couldn’t refresh this review: {error}</span>
            <Button size="xs" variant="outline" onClick={() => void load(true)}>
              Retry
            </Button>
          </div>
        ) : null}
        {conversationError ? (
          <div
            className="flex shrink-0 items-center gap-2 border-b border-destructive/30 bg-destructive/5 px-4 py-1.5 text-xs text-destructive"
            role="alert"
          >
            <span className="min-w-0 flex-1">{conversationError}</span>
            <Button
              size="icon-xs"
              variant="ghost"
              className="text-destructive hover:text-destructive"
              aria-label="Dismiss"
              onClick={() => setConversationError(null)}
            >
              <HugeiconsIcon icon={Cancel01Icon} size={12} />
            </Button>
          </div>
        ) : null}
        {!inspection && loading && !error ? (
          <div
            className="flex flex-1 items-center justify-center gap-2 text-xs text-muted-foreground"
            aria-busy="true"
          >
            <Spinner className="size-3" /> Loading review…
          </div>
        ) : null}

        {commentTarget?.path === null && !commentTarget.replyToId && !commentTarget.conversationKey ? (
          <div className="shrink-0 border-b border-border/60 bg-muted/[0.12] px-4 py-3">
            <DraftComposer
              target={commentTarget}
              onCancel={() => setCommentTarget(null)}
              onAdd={addDraft}
            />
          </div>
        ) : null}

        <div className={cn("flex min-h-0 min-w-0 flex-col @[1050px]:flex-row", inspection ? "flex-1" : "shrink-0")}>
          {inspection ? (
            <>
              <TabsContent
                value="changes"
                className={cn("grid min-h-0 min-w-0 flex-1 text-xs", filesOpen ? "grid-cols-[minmax(160px,200px)_minmax(0,1fr)]" : "grid-cols-1")}
              >
                {filesOpen ? <FileList
                  files={visibleFiles}
                  totalFiles={inspection.files.length}
                  fileThreadCounts={fileThreadCounts}
                  filter={fileFilter}
                  filterCounts={filterCounts}
                  onFilter={setFileFilter}
                  selectedPath={selectedPath}
                  onSelect={(path) => {
                    setSelectedPath(path);
                    setCommentTarget(null);
                  }}
                /> : null}
                <div className="flex min-h-0 min-w-0 flex-col">
                  {selectedFile ? (
                    <>
                      <div className="flex h-9 shrink-0 items-center gap-2 border-b border-border/60 px-3">
                        <Button size="xs" variant={filesOpen ? "secondary" : "ghost"}
                          aria-label={filesOpen ? "Hide changed files" : "Show changed files"}
                          aria-expanded={filesOpen} onClick={() => setFilesOpen((open) => !open)}>
                          Files {inspection.files.length}
                        </Button>
                        <span
                          className="min-w-0 flex-1 truncate font-mono text-xs"
                          title={
                            selectedFile.previousPath
                              ? `${selectedFile.previousPath} → ${selectedFile.path}`
                              : selectedFile.path
                          }
                        >
                          {selectedFile.previousPath ? (
                            <>
                              <span className="text-muted-foreground">
                                {selectedFile.previousPath}
                              </span>
                              <span aria-hidden className="mx-1.5 text-muted-foreground/60">
                                →
                              </span>
                            </>
                          ) : null}
                          {selectedFile.path}
                        </span>
                        <Badge variant="secondary" className="h-4 rounded-[6px] px-1.5 text-xs">
                          {fileStatusMeta(selectedFile.status).label}
                        </Badge>
                        <DiffStat
                          additions={selectedFile.additions}
                          deletions={selectedFile.deletions}
                        />
                        {navigableOpenThreads.length > 0 ? (
                          <Button size="xs" variant="outline" onClick={revealNextOpenConversation}>
                            Next open{" "}
                            <span className="tabular-nums opacity-65">
                              {navigableOpenThreads.length}
                            </span>
                          </Button>
                        ) : drafts.length === 0 && !commentTarget ? (
                          <span className="shrink-0 whitespace-nowrap text-xs text-muted-foreground">
                            Hover a line to comment
                          </span>
                        ) : null}
                      </div>
                      <PatchView
                        file={selectedFile}
                        reveal={reveal}
                        canComment={data.repository.features.inlineComments}
                        discussions={inspection.discussions}
                        target={commentTarget}
                        drafts={drafts}
                        onTarget={setCommentTarget}
                        onAddDraft={addDraft}
                        onCancelDraft={() => setCommentTarget(null)}
                        onResolve={resolveConversation}
                        canResolve={canResolve}
                        resolvingThreadId={resolvingThreadId}
                      />
                    </>
                  ) : (
                    <div className="flex flex-1 flex-col items-center justify-center gap-1 px-6 text-center">
                      <p className="text-sm font-medium text-foreground">No text diff</p>
                      <p className="max-w-sm text-xs leading-5 text-muted-foreground">
                        {inspection.files.length === 0
                          ? "This review changes no text files. Checks and conversations are still available."
                          : "Pick a file in the list to inspect its changes."}
                      </p>
                    </div>
                  )}
                </div>
              </TabsContent>

              <TabsContent value="overview" className="min-h-0 min-w-0 flex-1 overflow-y-auto text-xs">
                <div className="px-5 py-4">
                  <dl className="grid grid-cols-1 gap-x-8 divide-y divide-border/60 border-y border-border/60 md:grid-cols-2 md:divide-y-0">
                    {(
                      [
                        {
                          label: "Author",
                          value: <span className="font-medium">{inspection.summary.author.login}</span>,
                        },
                        {
                          label: "Commits",
                          value: (
                            <span className="font-medium tabular-nums">{inspection.commits}</span>
                          ),
                        },
                        {
                          label: "Diff",
                          value: (
                            <DiffStat
                              additions={inspection.additions}
                              deletions={inspection.deletions}
                            />
                          ),
                        },
                        {
                          label: "Merge status",
                          value: (
                            <span className="font-medium">
                              {inspection.mergeStatus ? humanize(inspection.mergeStatus) : "Unknown"}
                            </span>
                          ),
                        },
                        {
                          label: "Review status",
                          value: (
                            <span className={cn("font-medium", statusTone(reviewStatus ?? ""))}>
                              {reviewStatus ? humanize(reviewStatus) : "Not reviewed"}
                            </span>
                          ),
                        },
                        {
                          label: "Revision",
                          value: (
                            <span className="flex flex-wrap items-center gap-1.5">
                              <span className={SHA_CHIP} title={headSha ?? undefined}>
                                head {shortSha(headSha)}
                              </span>
                              <span className={SHA_CHIP} title={inspection.baseSha ?? undefined}>
                                base {shortSha(inspection.baseSha)}
                              </span>
                            </span>
                          ),
                        },
                      ] satisfies { label: string; value: ReactNode }[]
                    ).map((row) => (
                      <div
                        key={row.label}
                        className="flex items-center gap-4 border-border/60 py-1.5 md:border-b"
                      >
                        <dt className="w-28 shrink-0 text-muted-foreground">{row.label}</dt>
                        <dd className="min-w-0 flex-1">{row.value}</dd>
                      </div>
                    ))}
                  </dl>

                  <section className="mt-6">
                    <h2 className="text-xs font-semibold">Description</h2>
                    <p
                      className={cn(
                        "mt-2 whitespace-pre-wrap text-sm leading-6",
                        inspection.body ? "text-foreground" : "text-muted-foreground",
                      )}
                    >
                      {inspection.body || "No description provided."}
                    </p>
                  </section>

                  <section className="mt-6">
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="text-xs font-semibold">Merge readiness</h2>
                      {inspection.readiness?.approvalsRemaining !== null &&
                      inspection.readiness?.approvalsRemaining !== undefined ? (
                        <Badge variant="secondary" className="h-4 rounded-[6px] px-1.5 text-xs">
                          {inspection.readiness.approvalsRemaining === 0
                            ? "Approvals complete"
                            : `${inspection.readiness.approvalsRemaining} approval${inspection.readiness.approvalsRemaining === 1 ? "" : "s"} remaining`}
                        </Badge>
                      ) : null}
                    </div>
                    {inspection.readiness?.blockers.length ? (
                      <ul className="mt-2 divide-y divide-border/60 border-y border-border/60">
                        {inspection.readiness.blockers.map((blocker) => (
                          <li key={blocker} className="flex items-start gap-2 py-1.5 text-xs">
                            <span
                              aria-hidden
                              className="mt-1.5 size-1.5 shrink-0 rounded-full bg-destructive"
                            />
                            <span className="min-w-0 flex-1 leading-5">{blocker}</span>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="mt-2 text-xs text-muted-foreground">
                        {inspection.readiness ? "No reported blockers." : "Readiness was not reported."}
                      </p>
                    )}
                    {inspection.readiness?.reviewers.length ? (
                      <div className="mt-3">
                        <p className="text-xs font-medium text-muted-foreground">Reviewers</p>
                        <div className="mt-1.5 flex flex-wrap gap-1.5">
                          {inspection.readiness.reviewers.map((reviewer) => (
                            <Badge
                              key={reviewer.login}
                              variant="outline"
                              className="h-5 rounded-[6px] px-1.5 text-xs font-normal"
                            >
                              <span className="font-medium">@{reviewer.login}</span>
                              <span className={cn("text-muted-foreground", statusTone(reviewer.state))}>
                                {humanize(reviewer.state)}
                              </span>
                            </Badge>
                          ))}
                        </div>
                      </div>
                    ) : null}
                  </section>
                </div>
              </TabsContent>

              <TabsContent value="checks" className="min-h-0 min-w-0 flex-1 overflow-y-auto text-xs">
                {inspection.checks.length ? (
                  <ul className="divide-y divide-border/60 px-4 py-1">
                    {inspection.checks.map((check, index) => {
                      const presentation = checkPresentation(check.state);
                      const detailsUrl = safeHttpUrl(check.detailsUrl);
                      const content = (
                        <>
                          <HugeiconsIcon
                            icon={presentation.icon}
                            size={14}
                            className={cn("shrink-0", presentation.tone)}
                          />
                          <span className="min-w-0 flex-1 truncate text-xs font-medium">
                            {check.name}
                          </span>
                          <span className={cn("shrink-0 text-xs", presentation.tone)}>
                            {presentation.label}
                          </span>
                          {detailsUrl ? (
                            <HugeiconsIcon
                              icon={LinkSquare01Icon}
                              size={12}
                              className="shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100"
                            />
                          ) : null}
                        </>
                      );
                      return (
                        <li key={`${index}:${check.name}`}>
                          {detailsUrl ? (
                            <button
                              type="button"
                              title="Open check details in browser"
                              onClick={() => void desktop()?.openUrl(detailsUrl)}
                              className="group flex h-8 w-full cursor-pointer items-center gap-3 rounded-md px-1 text-left outline-none transition-colors hover:bg-accent/45 focus-visible:ring-2 focus-visible:ring-ring/35"
                            >
                              {content}
                            </button>
                          ) : (
                            <div className="flex h-8 w-full items-center gap-3 px-1">{content}</div>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                ) : (
                  <div className="flex h-full flex-col items-center justify-center gap-1 px-6 text-center">
                    <p className="text-sm font-medium text-foreground">No checks reported</p>
                    <p className="max-w-sm text-xs leading-5 text-muted-foreground">
                      {data.repository.providerLabel} did not report any status checks for this head.
                    </p>
                  </div>
                )}
              </TabsContent>

              {(["conversations", "history"] as const).map((mode) => (
                <TabsContent
                  key={mode}
                  value={mode}
                  className="flex min-h-0 min-w-0 flex-1 flex-col text-xs"
                >
                  <ConversationView
                    discussions={inspection.discussions}
                    mode={mode}
                    target={commentTarget}
                    onTarget={setCommentTarget}
                    onAddDraft={addDraft}
                    onCancelDraft={() => setCommentTarget(null)}
                    onRevealLocation={(path, line) => revealLocation(path, line)}
                    onResolve={resolveConversation}
                    canResolve={canResolve}
                    resolvingThreadId={resolvingThreadId}
                  />
                </TabsContent>
              ))}
            </>
          ) : null}

          {queueOpen ? (
            <DraftQueue
              drafts={drafts}
              publishing={publishing}
              canPublish={Boolean(headSha)}
              onRemove={(id) => draftKey && forgeReviewDrafts.remove(draftKey, id)}
              onUpdate={(id, body) => draftKey && forgeReviewDrafts.update(draftKey, id, body)}
              onReveal={(draft) => {
                if (draft.path) revealLocation(draft.path, draft.line, draft.side);
                else if (draft.replyToId || draft.replyToAuthor) changeView("conversations");
                else changeView("overview");
              }}
              onClose={() => setDraftsExpanded(false)}
              onPublish={openPublishDialog}
            />
          ) : null}
        </div>
      </Tabs>

      <AlertDialog
        open={publishOpen}
        onOpenChange={(open) => {
          if (!publishing) setPublishOpen(open);
        }}
      >
        <AlertDialogContent className="max-h-[85vh] grid-cols-[minmax(0,1fr)] overflow-y-auto data-[size=default]:sm:max-w-xl">
          <AlertDialogHeader className="min-w-0 grid-cols-[minmax(0,1fr)]">
            <AlertDialogTitle>{retryPending ? "Retry review" : "Submit review"}</AlertDialogTitle>
            <AlertDialogDescription className="min-w-0 [overflow-wrap:anywhere]">
              <span className="block font-medium text-foreground" title={reviewTitle}>
                {data.repository.slug} #{data.review.number} · {reviewTitle}
              </span>
              {retryPending
                ? `Already published feedback will not be sent again. Continue with the remaining feedback and review outcome after verifying head ${shortSha(publishTarget?.headSha ?? null)}.`
                : `Termco verifies the exact head ${shortSha(publishTarget?.headSha ?? null)} before anything is shared with ${data.repository.providerLabel}.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-3">
              <div>
                <p className="mb-1.5 text-xs font-medium">Outcome</p>
                <div
                  className="grid grid-cols-3 gap-1 rounded-md bg-muted/60 p-1"
                  role="group"
                  aria-label="Review outcome"
                >
                  {(["comment", "approve", "request_changes"] as const).map((outcome) => {
                    const disabled = (unsupportedOutcomes as ForgeReviewOutcome[]).includes(outcome);
                    return (
                      <Button
                        key={outcome}
                        type="button"
                        size="xs"
                        variant={reviewOutcome === outcome ? "secondary" : "ghost"}
                        disabled={disabled}
                        aria-pressed={reviewOutcome === outcome}
                        onClick={() => setReviewOutcome(outcome)}
                      >
                        {OUTCOME_LABELS[outcome]}
                      </Button>
                    );
                  })}
                </div>
                {unsupportedOutcomes.length > 0 ? (
                  <p className="mt-1.5 text-xs text-muted-foreground">
                    This integration does not yet support{" "}
                    {unsupportedOutcomes.map((outcome) => OUTCOME_LABELS[outcome].toLowerCase()).join(" or ")}{" "}
                    on {data.repository.providerLabel}. You can still leave comments.
                  </p>
                ) : null}
              </div>
              <div>
                <label htmlFor="forge-review-summary" className="mb-1.5 flex items-baseline gap-2 text-xs font-medium">
                  Review summary
                  <span className="font-normal text-muted-foreground">
                    {reviewOutcome === "request_changes" ? "Required" : "Optional"}
                  </span>
                </label>
                <Textarea
                  id="forge-review-summary"
                  value={reviewSummary}
                  onChange={(event) => setReviewSummary(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" && (event.metaKey || event.ctrlKey) && !submitDisabled) {
                      event.preventDefault();
                      void publish();
                    }
                  }}
                  placeholder="Summarize your review for the author…"
                  className="min-h-24 resize-y text-sm"
                />
              </div>
              <p className="text-xs">
                {publishDrafts.length > 0 ? (
                  <>
                    <span className="font-medium tabular-nums">{publishDrafts.length}</span> local draft
                    {publishDrafts.length === 1 ? "" : "s"} will be published with this review.
                  </>
                ) : (
                  <span className="text-muted-foreground">No local drafts. Only the summary and outcome are sent.</span>
                )}
              </p>
          </div>
          <div className="min-w-0 rounded-md border border-border/60 bg-muted/20 p-3 text-xs [overflow-wrap:anywhere]">
            <p className="font-medium">Publish to {data.repository.host}/{data.repository.slug} #{data.review.number}</p>
            <p className="mt-1 break-all font-mono text-muted-foreground">Head {publishTarget?.headSha}</p>
            {publishDrafts.length > 0 ? <ol aria-label="Comments to publish" className="mt-2 max-h-48 divide-y divide-border/60 overflow-y-auto">
              {publishDrafts.map((draft) => <li key={draft.id} className="py-2">
                <p className="font-medium">{draft.replyToId ? `Reply${draft.replyToAuthor ? ` to @${draft.replyToAuthor}` : ""}` : draft.path ? `${draft.path}:${draft.line} (${draft.side === "old" ? "base" : "head"})` : "Overall comment"}</p>
                <p className="mt-1 whitespace-pre-wrap break-words text-muted-foreground">{draft.body}</p>
              </li>)}
            </ol> : null}
          </div>
          {publishError ? (
            <p role="alert" className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive">
              {publishError}
            </p>
          ) : null}
          <AlertDialogFooter>
            <AlertDialogCancel disabled={publishing}>Keep editing</AlertDialogCancel>
            <AlertDialogAction
              disabled={submitDisabled}
              onClick={(event) => {
                event.preventDefault();
                void publish();
              }}
            >
              {publishing ? <Spinner className="size-3" /> : null} {submitLabel}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
