/** Source-owned by the coding-agent-native plugin.
 * The roster screen, scoped to one selected coding-agent backend. Shows
 * that agent's Active + Recent live runs and, inline, its preloaded past
 * sessions ("History"). A first-run empty state covers the no-activity case.
 */

import ui from "@termco/ui";
import {
  Add01Icon,
  ArrowRight01Icon,
  Clock01Icon,
  Link01Icon,
  Message01Icon,
  SparklesIcon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useMemo } from "react";
import type { AgentBackend, AgentSessionSummary } from "../lib/protocol";
import {
  isRunBusy,
  sortRuns,
  useCodingAgentsStore,
} from "../store/codingAgentsStore";
import { AgentRunCard } from "./AgentRunCard";
import { BackendAvatar, backendMeta } from "./backendMeta";

const { Button, Spinner, cn } = ui;

/** How many past sessions to show inline before "View all". */
const INLINE_HISTORY = 6;

function basename(p: string): string {
  const i = Math.max(p.lastIndexOf("/"), p.lastIndexOf("\\"));
  return (i >= 0 ? p.slice(i + 1) : p) || p;
}

/** "3m" / "2h" / "4d" since a timestamp (ms). */
function ago(ms: number): string {
  const s = Math.max(0, Math.floor((Date.now() - ms) / 1000));
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  return `${Math.floor(h / 24)}d`;
}

export function AgentRoster({
  backend,
  activeRigId,
  onBackend,
  onOpen,
  onOpenSession,
  onNew,
  onHistory,
  onConnect,
}: {
  backend: AgentBackend;
  /** The active rig — runs on it lead the roster; others are set apart. */
  activeRigId: string | null;
  onBackend: (b: AgentBackend) => void;
  onOpen: (runId: string) => void;
  onOpenSession: (summary: AgentSessionSummary) => void;
  onNew: () => void;
  onHistory: () => void;
  /** Open the "connect an external agent" panel (MCP tokens). */
  onConnect: () => void;
}) {
  const runsMap = useCodingAgentsStore((s) => s.runs);
  const activeRunId = useCodingAgentsStore((s) => s.activeRunId);
  const remove = useCodingAgentsStore((s) => s.remove);
  const sessions = useCodingAgentsStore((s) => s.sessions);
  const sessionsLoading = useCodingAgentsStore((s) => s.sessionsLoading);
  const allRuns = useMemo(
    () => sortRuns(runsMap).filter((r) => r.backend === backend),
    [runsMap, backend],
  );
  // Explicitly-unscoped runs remain visible; scoped runs follow their rig.
  const runs = useMemo(
    () => allRuns.filter((r) => !r.rigId || r.rigId === activeRigId),
    [allRuns, activeRigId],
  );
  const otherRigRuns = useMemo(
    () => allRuns.filter((r) => r.rigId && r.rigId !== activeRigId),
    [allRuns, activeRigId],
  );
  const history = useMemo(
    () => sessions.filter((s) => s.backend === backend),
    [sessions, backend],
  );

  const active = runs.filter((r) => isRunBusy(r.status));
  const recent = runs.filter((r) => !isRunBusy(r.status));
  // Don't flash the "no agents" empty state while the (possibly slow, ssh)
  // history load is still in flight — that would blink empty → populated.
  const empty =
    runs.length === 0 &&
    otherRigRuns.length === 0 &&
    history.length === 0 &&
    !sessionsLoading;

  return (
    <div data-onboarding-target="coding-agents.roster" className="flex h-full min-h-0 flex-col">
      {/* Agent toggle + New */}
      <div className="flex shrink-0 items-center gap-2 px-3 py-2.5">
        <div className="flex flex-1 gap-1.5">
          {(["claude", "codex"] as const).map((b) => (
            <button
              key={b}
              type="button"
              onClick={() => onBackend(b)}
              className={cn(
                "flex items-center gap-1.5 rounded-lg border px-2 py-1 text-xs font-medium transition-colors",
                backend === b
                  ? "border-primary bg-primary/10 text-foreground"
                  : "border-border/60 text-muted-foreground hover:bg-accent/50",
              )}
            >
              <BackendAvatar backend={b} size={18} />
              {backendMeta(b).label}
            </button>
          ))}
        </div>
        <Button
          data-onboarding-target="coding-agents.external"
          type="button"
          size="icon"
          variant="ghost"
          className="size-8"
          onClick={onConnect}
          title="Connect an external agent"
          aria-label="Connect an external agent"
        >
          <HugeiconsIcon icon={Link01Icon} size={15} strokeWidth={1.75} />
        </Button>
        <Button data-onboarding-target="coding-agents.new" type="button" size="sm" className="h-8 gap-1" onClick={onNew}>
          <HugeiconsIcon icon={Add01Icon} size={14} strokeWidth={2} />
          New
        </Button>
      </div>

      {empty ? (
        <EmptyRoster label={backendMeta(backend).label} onNew={onNew} />
      ) : (
        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-3 pb-3 pt-1">
          {active.length > 0 && (
            <Section label={`Active · ${active.length}`}>
              {active.map((r) => (
                <AgentRunCard
                  key={r.runId}
                  run={r}
                  active={r.runId === activeRunId}
                  onOpen={() => onOpen(r.runId)}
                  onRemove={() => remove(r.runId)}
                />
              ))}
            </Section>
          )}
          {recent.length > 0 && (
            <Section label="Recent">
              {recent.map((r) => (
                <AgentRunCard
                  key={r.runId}
                  run={r}
                  active={r.runId === activeRunId}
                  onOpen={() => onOpen(r.runId)}
                  onRemove={() => remove(r.runId)}
                />
              ))}
            </Section>
          )}
          {otherRigRuns.length > 0 && (
            <Section label={`Other rigs · ${otherRigRuns.length}`}>
              {otherRigRuns.map((r) => (
                <AgentRunCard
                  key={r.runId}
                  run={r}
                  active={r.runId === activeRunId}
                  onOpen={() => onOpen(r.runId)}
                  onRemove={() => remove(r.runId)}
                />
              ))}
            </Section>
          )}
          {history.length > 0 && (
            <Section
              label={`History · ${history.length}`}
              action={
                history.length > INLINE_HISTORY ? (
                  <button
                    type="button"
                    onClick={onHistory}
                    className="flex items-center gap-0.5 text-xs font-medium text-muted-foreground hover:text-foreground"
                  >
                    View all
                    <HugeiconsIcon
                      icon={ArrowRight01Icon}
                      size={11}
                      strokeWidth={2}
                    />
                  </button>
                ) : null
              }
            >
              {history.slice(0, INLINE_HISTORY).map((s) => (
                <SessionRow
                  key={`${s.backend}:${s.sessionId}:${s.filePath ?? ""}`}
                  summary={s}
                  onOpen={() => onOpenSession(s)}
                />
              ))}
            </Section>
          )}
          {/* LOCALIZED history-loading indicator — the run roster above is
              already interactive; only this part waits on the (ssh) fetch. */}
          {sessionsLoading && history.length === 0 && (
            <div className="flex items-center gap-2 px-1 py-2 text-xs text-muted-foreground">
              <Spinner className="size-3" />
              Loading history…
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/** A compact past-session row (opens read-only, resumable via the composer). */
function SessionRow({
  summary,
  onOpen,
}: {
  summary: AgentSessionSummary;
  onOpen: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onOpen}
      className="flex w-full items-center gap-2 rounded-lg border border-border/50 bg-card/60 px-2.5 py-2 text-left transition-colors hover:border-border"
    >
      <div className="min-w-0 flex-1">
        <div className="truncate text-xs text-foreground">{summary.name}</div>
        <div className="mt-0.5 flex items-center gap-1.5 font-mono text-xs text-muted-foreground/80">
          {summary.projectName || basename(summary.cwd) ? (
            <span className="truncate">
              {summary.projectName || basename(summary.cwd)}
            </span>
          ) : null}
          <span className="opacity-40">·</span>
          <span className="inline-flex shrink-0 items-center gap-0.5">
            <HugeiconsIcon icon={Message01Icon} size={9} strokeWidth={1.75} />
            {summary.messageCount}
          </span>
          <span className="opacity-40">·</span>
          <span className="inline-flex shrink-0 items-center gap-0.5">
            <HugeiconsIcon icon={Clock01Icon} size={9} strokeWidth={1.75} />
            {ago(summary.updatedAt)}
          </span>
        </div>
      </div>
    </button>
  );
}

function Section({
  label,
  action,
  children,
}: {
  label: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-2">
      <div className="flex items-center px-1 pt-1">
        <span className="flex-1 text-xs font-medium uppercase tracking-wide text-muted-foreground/70">
          {label}
        </span>
        {action}
      </div>
      {children}
    </div>
  );
}

function EmptyRoster({ label, onNew }: { label: string; onNew: () => void }) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-5 px-8 py-10 text-center">
      <BackendAvatar
        backend={label === "Codex" ? "codex" : "claude"}
        size={44}
      />
      <div className="space-y-1.5">
        <p className="text-sm font-semibold tracking-tight text-foreground">
          Run {label}
        </p>
        <p className="max-w-[19rem] text-xs leading-relaxed text-muted-foreground">
          Hand it a task. It works in your project and reports back here —
          natively, no terminal to babysit. Run several at once.
        </p>
      </div>
      <Button type="button" size="sm" className="gap-1.5" onClick={onNew}>
        <HugeiconsIcon icon={SparklesIcon} size={13} strokeWidth={1.75} />
        Start {label}
      </Button>
    </div>
  );
}
