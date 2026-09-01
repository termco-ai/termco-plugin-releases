/** Source-owned by the coding-agent-native plugin.
 * Presentational derivations from a run: a status badge, a live-activity line
 * (what the agent is doing right now), and human-formatted duration/usage. Pure
 * helpers + one small component, so the cards/detail stay declarative.
 */

import ui from "@termco/ui";
import {
  AlertCircleIcon,
  CheckmarkCircle02Icon,
  Clock01Icon,
  PauseIcon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useEffect, useState } from "react";
import type { AgentRunStatus, AgentWorkspace } from "../lib/protocol";
import type { AgentRunView } from "../store/codingAgentsStore";

const { Spinner, cn } = ui;

/** Where a run executes, as a short label — `null` for local (not worth a
 * badge), `wsl[:distro]` for WSL, `user@host` for ssh. */
export function workspaceLabel(ws?: AgentWorkspace): string | null {
  if (!ws || ws.kind === "local") return null;
  if (ws.kind === "wsl") return ws.distro ? `wsl:${ws.distro}` : "wsl";
  return `${ws.user ? `${ws.user}@` : ""}${ws.host}`;
}

/** Compact host chip for run rows / the detail header. Renders nothing for
 * local runs — only a REMOTE execution location earns attention. */
export function WorkspaceBadge({
  workspace,
  className,
}: {
  workspace?: AgentWorkspace;
  className?: string;
}) {
  const label = workspaceLabel(workspace);
  if (!label) return null;
  return (
    <span
      title={`Runs on ${label}`}
      className={cn(
        "inline-flex h-5 max-w-36 items-center truncate rounded-md border border-sky-500/30 bg-sky-500/10 px-1.5 font-mono text-xs font-medium text-sky-600 dark:text-sky-400",
        className,
      )}
    >
      {label}
    </span>
  );
}

type StatusStyle = { label: string; tone: string; icon: React.ReactNode };

function statusStyle(status: AgentRunStatus): StatusStyle {
  switch (status) {
    case "starting":
      return {
        label: "Starting",
        tone: TONE.busy,
        icon: <Spinner className="size-3" />,
      };
    case "running":
      return {
        label: "Working",
        tone: TONE.busy,
        icon: <Spinner className="size-3" />,
      };
    case "awaiting-approval":
      return {
        label: "Needs approval",
        tone: TONE.warn,
        icon: (
          <HugeiconsIcon icon={AlertCircleIcon} size={12} strokeWidth={2} />
        ),
      };
    case "idle":
      // "Idle" reads like the run is stuck; it's actually finished a turn and is
      // waiting for the user's next message, so label it as such.
      return {
        label: "Ready",
        tone: TONE.idle,
        icon: <HugeiconsIcon icon={PauseIcon} size={11} strokeWidth={2} />,
      };
    case "done":
      return {
        label: "Done",
        tone: TONE.done,
        icon: (
          <HugeiconsIcon
            icon={CheckmarkCircle02Icon}
            size={12}
            strokeWidth={2}
          />
        ),
      };
    case "error":
      return {
        label: "Error",
        tone: TONE.error,
        icon: (
          <HugeiconsIcon icon={AlertCircleIcon} size={12} strokeWidth={2} />
        ),
      };
    case "aborted":
      return {
        label: "Stopped",
        tone: TONE.idle,
        icon: <HugeiconsIcon icon={PauseIcon} size={11} strokeWidth={2} />,
      };
  }
}

const TONE = {
  busy: "border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
  warn: "border-amber-500/40 bg-amber-500/10 text-amber-600 dark:text-amber-400",
  idle: "border-border/60 bg-card text-muted-foreground",
  done: "border-emerald-600/25 bg-emerald-600/10 text-emerald-700 dark:text-emerald-400",
  error: "border-destructive/40 bg-destructive/10 text-destructive",
};

/** The status chip shown on cards and in the detail header. */
export function StatusBadge({
  status,
  className,
}: {
  status: AgentRunStatus;
  className?: string;
}) {
  const s = statusStyle(status);
  return (
    <span
      className={cn(
        "inline-flex h-5 items-center gap-1 rounded-md border px-1.5 text-xs font-medium",
        s.tone,
        className,
      )}
    >
      {s.icon}
      {s.label}
    </span>
  );
}

/** A one-line "what is it doing now" string, derived from the transcript tail. */
export function liveActivity(run: AgentRunView): string {
  if (run.status === "awaiting-approval") return "Waiting for your approval";
  if (run.status !== "running" && run.status !== "starting") return "";
  // Find the most recent tool call that hasn't produced output yet.
  const last = run.messages[run.messages.length - 1];
  const parts = (last?.parts ?? []) as Array<Record<string, unknown>>;
  for (let i = parts.length - 1; i >= 0; i--) {
    const p = parts[i];
    const type = typeof p.type === "string" ? p.type : "";
    if (
      type.startsWith("tool-") &&
      p.state !== "output-available" &&
      p.state !== "output-error"
    ) {
      return `Running ${type.replace(/^tool-/, "").replace(/_/g, " ")}…`;
    }
  }
  return "Thinking…";
}

/** "3s" / "2m" / "1h 4m" from elapsed milliseconds. */
export function formatDuration(ms: number): string {
  if (!Number.isFinite(ms) || ms < 0) return "";
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  return `${h}h ${m % 60}m`;
}

/** Compact usage summary: "$0.0031 · 1.2k tok" (either half optional). */
export function formatUsage(run: AgentRunView): string {
  const bits: string[] = [];
  if (typeof run.costUsd === "number" && run.costUsd > 0) {
    bits.push(
      `$${run.costUsd < 0.01 ? run.costUsd.toFixed(4) : run.costUsd.toFixed(2)}`,
    );
  }
  const tokens = (run.usage?.inputTokens ?? 0) + (run.usage?.outputTokens ?? 0);
  if (tokens > 0)
    bits.push(
      `${tokens >= 1000 ? `${(tokens / 1000).toFixed(1)}k` : tokens} tok`,
    );
  return bits.join(" · ");
}

/** "12% of 200k" context usage, or "" when the window is unknown. Uses the
 * last turn's input tokens (the resident context), not cumulative output. */
export function formatContext(run: AgentRunView): string {
  const window = run.usage?.contextWindow;
  const input = run.usage?.inputTokens;
  if (!window || window <= 0 || typeof input !== "number") return "";
  const pct = Math.min(100, Math.round((input / window) * 100));
  const total = window >= 1000 ? `${Math.round(window / 1000)}k` : `${window}`;
  return `${pct}% of ${total}`;
}

export function ElapsedChip({
  since,
  live,
}: {
  since: number;
  live?: boolean;
}) {
  // Re-render every second while the run is live so the timer actually counts
  // up; a finished run's elapsed is frozen (computed once).
  const [, tick] = useState(0);
  useEffect(() => {
    if (!live) return;
    const id = setInterval(() => tick((n) => n + 1), 1000);
    return () => clearInterval(id);
  }, [live]);

  const label = formatDuration(performance.now() - since);
  if (!label) return null;
  return (
    <span className="inline-flex items-center gap-0.5 text-xs text-muted-foreground/70 tabular-nums">
      <HugeiconsIcon icon={Clock01Icon} size={10} strokeWidth={1.75} />
      {label}
    </span>
  );
}
