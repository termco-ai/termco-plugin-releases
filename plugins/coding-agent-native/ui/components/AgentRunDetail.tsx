/** Source-owned by the coding-agent-native plugin.
 * The detail view for one run: a metadata header (back nav, backend, task,
 * status, model / cwd / usage, Stop), the native transcript rendered through the
 * chat's `RenderedMessage`, and a follow-up composer. This is what replaces
 * watching a raw agent TUI in a terminal.
 */

import ui from "@termco/ui";
import {
  AlertCircleIcon,
  ArrowDown01Icon,
  ArrowLeft01Icon,
  GitBranchIcon,
  MoreHorizontalIcon,
  SentIcon,
  StopIcon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useEffect, useState } from "react";
import { codingAgentUiRuntime } from "../runtime";
import { useComposerSlash } from "../lib/useComposerSlash";
import { useStickyScroll } from "../lib/useStickyScroll";
import {
  type AgentRunView,
  HISTORY_PREFIX,
  isRunBusy,
  useCodingAgentsStore,
} from "../store/codingAgentsStore";
import { AgentControlRow } from "./AgentControlRow";
import { AgentInfoPopover } from "./AgentInfoPopover";
import { BackendAvatar, backendMeta } from "./backendMeta";
import {
  type MessageAction,
  MessageActionBar,
  messagePlainText,
  RenderedMessage,
} from "./MessageView";
import {
  liveActivity,
  StatusBadge,
  workspaceLabel,
} from "./runMeta";

const {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  Spinner,
  cn,
} = ui;

export function AgentRunDetail({
  run,
  activeRigId,
  activeRigName,
  onBack,
  onResume,
  onOpenTerminal,
}: {
  run: AgentRunView;
  /** The currently-active rig, to flag when this run belongs to another. */
  activeRigId?: string | null;
  activeRigName?: string;
  onBack: () => void;
  /** Present on a read-only history run: sending a follow-up resumes the
   * session (spawns a live run) instead of the disabled `sendInput` path. */
  onResume?: (text: string) => void;
  /** Open a terminal in the run's working directory. */
  onOpenTerminal?: () => void;
}) {
  const sendInput = useCodingAgentsStore((s) => s.sendInput);
  const setRunSettings = useCodingAgentsStore((s) => s.setRunSettings);
  const setQueued = useCodingAgentsStore((s) => s.setQueued);
  const abort = useCodingAgentsStore((s) => s.abort);
  const respondApproval = useCodingAgentsStore((s) => s.respondApproval);
  const forkRun = useCodingAgentsStore((s) => s.forkRun);
  const rename = useCodingAgentsStore((s) => s.rename);
  const archive = useCodingAgentsStore((s) => s.archive);
  // Present only while the trajectory plugin is enabled (ring-2 seam store).
  const trajectory = codingAgentUiRuntime().trajectory;
  const [draft, setDraft] = useState("");
  // Inline "branch/edit from here" editor keyed by message index.
  const [forkIndex, setForkIndex] = useState<number | null>(null);
  // Inline title rename.
  const [titleDraft, setTitleDraft] = useState<string | null>(null);
  const busy = isRunBusy(run.status);
  const closed =
    run.status === "done" || run.status === "error" || run.status === "aborted";
  const {
    ref: scrollRef,
    atBottom,
    onScroll,
    scrollToBottom,
  } = useStickyScroll(run.messages);

  // Esc stops a running agent (only when the composer isn't focused, so Esc can
  // still blur the textarea normally).
  useEffect(() => {
    if (!busy) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === "TEXTAREA" || tag === "INPUT") return;
      e.preventDefault();
      void abort(run.runId);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [busy, abort, run.runId]);
  // Drop empty assistant messages (a message-start with no rendered content) so
  // they don't leave a stray provider header with nothing under it. Carry each
  // message's REAL index in run.messages along — the render loop needs it for
  // fork targeting, and a per-row findIndex made rendering O(messages²) at
  // streaming token rate.
  const renderedMessages = run.messages.reduce<
    Array<{ m: (typeof run.messages)[number]; realIndex: number }>
  >((acc, m, idx) => {
    if (m.role === "user" || (m.parts?.length ?? 0) > 0) {
      acc.push({ m, realIndex: idx });
    }
    return acc;
  }, []);

  // A history run is read-only, but `onResume` turns a follow-up into a resumed
  // live run — so the composer stays usable there.
  const resumable = Boolean(onResume);
  // Slash-command autocomplete is enabled whenever the
  // composer can accept input.
  const slash = useComposerSlash({
    cwd: run.cwd,
    enabled: !closed || resumable,
    draft,
    setDraft,
  });
  const submit = () => {
    const text = draft.trim();
    if (!text) return;
    setDraft("");
    if (onResume) {
      onResume(text);
      return;
    }
    // While busy this queues (auto-sent when the turn completes); when idle it
    // sends immediately.
    void sendInput(run.runId, text);
  };

  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* Header */}
      <div className="flex shrink-0 items-start gap-2 border-b border-border/50 px-3 py-2.5">
        <Button
          type="button"
          size="icon"
          variant="ghost"
          className="mt-0.5 size-7 shrink-0"
          onClick={onBack}
          title="Back to all agents"
          aria-label="Back"
        >
          <HugeiconsIcon icon={ArrowLeft01Icon} size={16} strokeWidth={1.75} />
        </Button>
        <div className="min-w-0 flex-1">
          <div className="flex min-h-6 items-center">
            {titleDraft !== null ? (
              <input
                // biome-ignore lint/a11y/noAutofocus: focus the rename field the user just opened
                autoFocus
                value={titleDraft}
                onChange={(e) => setTitleDraft(e.target.value)}
                onBlur={() => {
                  if (titleDraft.trim()) void rename(run.runId, titleDraft);
                  setTitleDraft(null);
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    if (titleDraft.trim()) void rename(run.runId, titleDraft);
                    setTitleDraft(null);
                  } else if (e.key === "Escape") {
                    e.preventDefault();
                    setTitleDraft(null);
                  }
                }}
                className="min-w-0 flex-1 rounded border border-border bg-background px-1 py-0.5 text-sm font-semibold text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring/40"
              />
            ) : (
              <button
                type="button"
                onDoubleClick={() => setTitleDraft(run.title)}
                title="Double-click to rename"
                className="min-w-0 flex-1 truncate text-left text-sm font-semibold text-foreground"
              >
                {run.title}
              </button>
            )}
          </div>
          <div className="mt-1 flex min-w-0 items-center gap-2 text-xs text-muted-foreground/70">
            <StatusBadge status={run.status} className="shrink-0" />
            {workspaceLabel(run.workspace) && (
              <>
                <span aria-hidden="true" className="opacity-35">
                  ·
                </span>
                <span
                  className="truncate font-mono"
                  title={`Runs on ${workspaceLabel(run.workspace)}`}
                >
                  {workspaceLabel(run.workspace)}
                </span>
              </>
            )}
          </div>
        </div>
        <div className="mt-0.5 flex shrink-0 items-center gap-0.5">
          <AgentInfoPopover run={run} />
          <DropdownMenu modal={false}>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                aria-label="Run actions"
                title="More actions"
                className="grid size-7 shrink-0 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
              >
                <HugeiconsIcon
                  icon={MoreHorizontalIcon}
                  size={16}
                  strokeWidth={1.75}
                />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="min-w-36">
              <DropdownMenuItem onSelect={() => setTitleDraft(run.title)}>
                Rename
              </DropdownMenuItem>
              {onOpenTerminal && (
                <DropdownMenuItem onSelect={onOpenTerminal}>
                  Open terminal
                </DropdownMenuItem>
              )}
              <DropdownMenuItem onSelect={() => void archive(run.runId)}>
                Archive
              </DropdownMenuItem>
              {trajectory && !run.runId.startsWith(HISTORY_PREFIX) && (
                <DropdownMenuItem
                  data-testid="agent-run-open-trajectory"
                  onSelect={() => trajectory.openSession(run.runId as never)}
                >
                  Open trajectory
                </DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
          {busy && (
            <Button
              type="button"
              size="icon"
              variant="ghost"
              className="size-7 shrink-0 text-destructive hover:bg-destructive/10 hover:text-destructive"
              onClick={() => void abort(run.runId)}
              title="Stop the agent (Esc)"
              aria-label="Stop agent (Esc)"
            >
              <HugeiconsIcon icon={StopIcon} size={15} strokeWidth={2} />
            </Button>
          )}
        </div>
      </div>

      {/* Cross-rig banner: you're viewing a run that belongs to another rig
          than the one you're currently in — make that unmistakable. */}
      {run.rigId && activeRigId && run.rigId !== activeRigId && (
        <div className="mx-3 mt-2 flex items-center gap-1.5 rounded-lg border border-amber-500/40 bg-amber-500/10 px-2.5 py-1.5 text-xs text-amber-700 dark:text-amber-300">
          <HugeiconsIcon icon={AlertCircleIcon} size={13} strokeWidth={2} />
          <span>
            This agent runs on{" "}
            <span className="font-medium">
              {workspaceLabel(run.workspace) ?? "another rig"}
            </span>{" "}
            — you're now in{" "}
            <span className="font-medium">
              {activeRigName ?? "another rig"}
            </span>
            .
          </span>
        </div>
      )}

      {/* Transcript */}
      <div className="relative min-h-0 flex-1">
        <div
          ref={scrollRef}
          onScroll={onScroll}
          className="h-full overflow-y-auto px-3 py-3"
        >
          {renderedMessages.length === 0 ? (
            <div className="flex h-full flex-col items-center justify-center gap-2 text-muted-foreground">
              <Spinner className="size-4" />
              <span className="text-xs">
                {liveActivity(run) || "Starting…"}
              </span>
            </div>
          ) : (
            <div className="agents-transcript flex flex-col gap-5">
              {renderedMessages.map(({ m, realIndex }, i) => {
                // One provider header per consecutive assistant run (like a chat
                // transcript) — not one per message.
                const showHeader =
                  m.role !== "user" &&
                  (i === 0 || renderedMessages[i - 1].m.role === "user");
                const copyText = messagePlainText(m);
                // Branch/edit is offered on user messages of a resumable run
                // (needs a backend session to fork).
                const canFork =
                  m.role === "user" && Boolean(run.sessionId) && !busy;
                const actions: MessageAction[] = canFork
                  ? [
                      {
                        key: "fork",
                        icon: GitBranchIcon,
                        label: "Branch / edit from here",
                        onClick: () => setForkIndex(realIndex),
                      },
                    ]
                  : [];

                if (forkIndex === realIndex) {
                  return (
                    <AgentForkEditor
                      key={m.id}
                      initial={copyText}
                      onCancel={() => setForkIndex(null)}
                      onSubmit={(text) => {
                        setForkIndex(null);
                        void forkRun(
                          run.runId,
                          realIndex,
                          text,
                          run.workspace ?? null,
                        );
                      }}
                    />
                  );
                }
                return (
                  <div
                    key={m.id}
                    className="group/msg relative flex flex-col gap-1.5"
                  >
                    {showHeader && (
                      <div className="flex items-center gap-1.5">
                        <BackendAvatar backend={run.backend} size={18} />
                        <span className="text-xs font-medium text-muted-foreground">
                          {backendMeta(run.backend).label}
                        </span>
                      </div>
                    )}
                    <MessageActionBar
                      text={copyText || undefined}
                      actions={actions}
                    />
                    <RenderedMessage
                      message={m}
                      allowRemember
                      onApproval={(approvalId, approved, always) =>
                        void respondApproval(
                          run.runId,
                          approvalId,
                          approved,
                          always,
                        )
                      }
                      streaming={
                        run.status === "running" &&
                        i === renderedMessages.length - 1
                      }
                    />
                  </div>
                );
              })}
              {busy && (
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Spinner className="size-3" />
                  <span className="animate-pulse">{liveActivity(run)}</span>
                </div>
              )}
              {run.error && (
                <div className="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">
                  {run.error}
                </div>
              )}
            </div>
          )}
        </div>
        {!atBottom && (
          <button
            type="button"
            onClick={scrollToBottom}
            aria-label="Scroll to bottom"
            className="absolute bottom-2 left-1/2 grid size-8 -translate-x-1/2 place-items-center rounded-full border border-border/50 bg-card text-muted-foreground shadow-sm transition-colors hover:text-foreground"
          >
            <HugeiconsIcon icon={ArrowDown01Icon} size={15} strokeWidth={2} />
          </button>
        )}
      </div>

      {/* Composer */}
      <div className="shrink-0 border-t border-border/50 p-2">
        {/* Mid-session controls — a live run only (a read-only history run's
            resume path doesn't thread these yet). */}
        {!resumable && !closed && (
          <AgentControlRow
            run={run}
            onChange={(patch) => setRunSettings(run.runId, patch)}
          />
        )}
        {run.queuedInput ? (
          <QueuedMessageCard
            text={run.queuedInput}
            onEdit={() => {
              setDraft(run.queuedInput ?? "");
              setQueued(run.runId, "");
            }}
            onRemove={() => setQueued(run.runId, "")}
          />
        ) : null}
        {slash.open && (
          <SlashCommandMenu
            matches={slash.matches}
            index={slash.index}
            onHover={slash.setIndex}
            onPick={slash.apply}
          />
        )}
        <div
          className={cn(
            "flex items-end gap-1.5 rounded-xl border border-border/60 bg-background px-2.5 py-2",
            "focus-within:border-border focus-within:ring-1 focus-within:ring-ring/40",
            closed && !resumable && "opacity-50",
          )}
        >
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              // The slash menu gets first crack at navigation/selection keys.
              if (slash.handleKeyDown(e)) return;
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                submit();
              }
            }}
            rows={1}
            disabled={closed && !resumable}
            placeholder={
              resumable
                ? "Continue this session…"
                : busy
                  ? "Queue a follow-up…"
                  : "Send a follow-up…"
            }
            className="max-h-32 min-h-6 flex-1 resize-none bg-transparent text-sm text-foreground placeholder:text-muted-foreground/70 focus-visible:outline-none"
          />
          <Button
            type="button"
            size="icon"
            className="size-8 shrink-0 rounded-lg"
            onClick={submit}
            disabled={!draft.trim() || (closed && !resumable)}
            title={
              resumable
                ? "Continue (Enter)"
                : busy
                  ? "Queue (Enter)"
                  : "Send (Enter)"
            }
            aria-label={resumable ? "Continue" : busy ? "Queue" : "Send"}
          >
            <HugeiconsIcon icon={SentIcon} size={15} strokeWidth={1.75} />
          </Button>
        </div>
      </div>
    </div>
  );
}

/** Inline editor to branch/edit from a user message (Enter submits, Esc cancels).
 * The (possibly edited) text becomes the first turn of a forked run. */
function AgentForkEditor({
  initial,
  onSubmit,
  onCancel,
}: {
  initial: string;
  onSubmit: (text: string) => void;
  onCancel: () => void;
}) {
  const [value, setValue] = useState(initial);
  return (
    <div className="rounded-lg border border-primary/40 bg-background p-2">
      <div className="mb-1 flex items-center gap-1 text-xs font-medium uppercase tracking-wide text-primary/80">
        <HugeiconsIcon icon={GitBranchIcon} size={11} strokeWidth={2} />
        Branch from here
      </div>
      <textarea
        // biome-ignore lint/a11y/noAutofocus: focus the editor the user just opened
        autoFocus
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            if (value.trim()) onSubmit(value);
          } else if (e.key === "Escape") {
            e.preventDefault();
            onCancel();
          }
        }}
        rows={Math.min(8, Math.max(2, value.split("\n").length))}
        className="w-full resize-none bg-transparent text-sm text-foreground focus-visible:outline-none"
      />
      <div className="mt-1 flex items-center justify-end gap-1.5">
        <button
          type="button"
          onClick={onCancel}
          className="rounded-md px-2 py-0.5 text-xs text-muted-foreground hover:text-foreground"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={() => value.trim() && onSubmit(value)}
          disabled={!value.trim()}
          className="rounded-md bg-primary px-2 py-0.5 text-xs font-medium text-primary-foreground disabled:opacity-50"
        >
          Branch
        </button>
      </div>
    </div>
  );
}

/** Autocomplete popover listing custom slash-commands matching the draft. */
function SlashCommandMenu({
  matches,
  index,
  onHover,
  onPick,
}: {
  matches: import("../lib/protocol").SlashCommand[];
  index: number;
  onHover: (i: number) => void;
  onPick: (cmd: import("../lib/protocol").SlashCommand) => void;
}) {
  return (
    <div className="mb-1.5 max-h-52 overflow-y-auto rounded-lg border border-border/60 bg-popover p-1 shadow-md">
      {matches.map((c, i) => (
        <button
          key={`${c.scope}:${c.name}`}
          type="button"
          onMouseEnter={() => onHover(i)}
          onMouseDown={(e) => {
            // Keep textarea focus; select on mousedown before blur.
            e.preventDefault();
            onPick(c);
          }}
          className={cn(
            "flex w-full items-baseline gap-2 rounded-md px-2 py-1.5 text-left",
            i === index ? "bg-accent" : "hover:bg-accent/50",
          )}
        >
          <span className="shrink-0 font-mono text-xs font-medium text-foreground">
            /{c.name}
          </span>
          {c.description && (
            <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground">
              {c.description}
            </span>
          )}
          <span className="shrink-0 text-xs uppercase tracking-wide text-muted-foreground/60">
            {c.scope}
          </span>
        </button>
      ))}
    </div>
  );
}

/** A follow-up waiting to auto-send when the current turn finishes. */
function QueuedMessageCard({
  text,
  onEdit,
  onRemove,
}: {
  text: string;
  onEdit: () => void;
  onRemove: () => void;
}) {
  return (
    <div className="mb-1.5 flex items-start gap-2 rounded-lg border border-border/60 bg-muted/40 px-2.5 py-1.5">
      <span className="mt-0.5 shrink-0 rounded bg-primary/15 px-1 py-0.5 text-xs font-medium uppercase tracking-wide text-primary">
        Queued
      </span>
      <span className="min-w-0 flex-1 truncate text-xs text-foreground">
        {text}
      </span>
      <button
        type="button"
        onClick={onEdit}
        className="shrink-0 text-xs text-muted-foreground hover:text-foreground"
      >
        Edit
      </button>
      <button
        type="button"
        onClick={onRemove}
        className="shrink-0 text-xs text-muted-foreground hover:text-destructive"
      >
        Remove
      </button>
    </div>
  );
}
