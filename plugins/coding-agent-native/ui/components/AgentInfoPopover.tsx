/** Source-owned by the coding-agent-native plugin.
 * The run's cost, status, and help information folded
 * into one compact popover that fits the dock: usage/cost, the run's status
 * (backend, model, mode, cwd, session), and a keyboard/feature cheat-sheet.
 * Opened from an info button in the run header.
 */

import ui from "@termco/ui";
import {
  ArrowTurnBackwardIcon,
  CpuIcon,
  InformationCircleIcon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useEffect, useState } from "react";
import { listCheckpoints, rewindRun } from "../lib/client";
import { useTranscriptPrefs } from "../lib/transcriptPrefs";
import type { AgentRunView } from "../store/codingAgentsStore";
import { permissionModeLabel } from "./agentSettings";
import { backendMeta } from "./backendMeta";
import { formatContext, formatUsage, workspaceLabel } from "./runMeta";

const { Popover, PopoverContent, PopoverTrigger, Switch } = ui;

export function AgentInfoPopover({ run }: { run: AgentRunView }) {
  const usage = formatUsage(run);
  const context = formatContext(run);
  const tokensIn = run.usage?.inputTokens ?? 0;
  const tokensOut = run.usage?.outputTokens ?? 0;
  const showThinking = useTranscriptPrefs((s) => s.showThinking);
  const setShowThinking = useTranscriptPrefs((s) => s.setShowThinking);
  const [open, setOpen] = useState(false);
  const [checkpoints, setCheckpoints] = useState<
    Array<{ turnIndex: number; at: number }>
  >([]);
  const [rewindMsg, setRewindMsg] = useState<string | null>(null);

  // Load file checkpoints when the panel opens (they live in the main process).
  useEffect(() => {
    if (!open) return;
    let alive = true;
    listCheckpoints(run.runId)
      .then((c) => alive && setCheckpoints(c.filter((x) => x.turnIndex >= 0)))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [open, run.runId]);

  return (
    <Popover modal={false} open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label="Run info"
          title="Cost, status & help"
          className="grid size-7 shrink-0 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
        >
          <HugeiconsIcon
            icon={InformationCircleIcon}
            size={15}
            strokeWidth={1.75}
          />
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        className="w-80 gap-0 overflow-hidden p-0 text-xs"
      >
        <div className="flex items-start gap-3 border-b border-border/70 px-3.5 py-3">
          <span className="grid size-8 shrink-0 place-items-center rounded-md border border-border bg-muted/35 text-muted-foreground">
            <HugeiconsIcon icon={CpuIcon} size={15} strokeWidth={1.7} />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-xs font-semibold text-foreground">Agent run</p>
            <p className="mt-0.5 truncate text-xs text-muted-foreground">
              {backendMeta(run.backend).label} ·{" "}
              {run.model || run.requestedModel || "default model"}
            </p>
          </div>
        </div>
        <Section title="Usage">
          <div className="grid grid-cols-2 gap-1.5">
            <Metric
              label="Estimated cost"
              value={
                usage.split(" · ")[0]?.startsWith("$")
                  ? (usage.split(" · ")[0] ?? "—")
                  : "—"
              }
            />
            <Metric label="Context" value={context || "—"} />
            <Metric
              label="Tokens in"
              value={tokensIn ? tokensIn.toLocaleString() : "—"}
            />
            <Metric
              label="Tokens out"
              value={tokensOut ? tokensOut.toLocaleString() : "—"}
            />
          </div>
        </Section>
        <Section title="Status">
          <Row label="Backend">{backendMeta(run.backend).label}</Row>
          <Row label="Model">
            {run.model || run.requestedModel || "default"}
          </Row>
          <Row label="Workspace" mono>
            {workspaceLabel(run.workspace) || "local"}
          </Row>
          <Row label="Autonomy">{permissionModeLabel(run.permissionMode)}</Row>
          <Row label="Effort">{run.effort ?? "auto"}</Row>
          <Row label="Session" mono>
            {run.sessionId ? `${run.sessionId.slice(0, 12)}…` : "—"}
          </Row>
          <Row label="Folder" mono>
            {run.cwd || "—"}
          </Row>
        </Section>
        <Section title="Display">
          <div className="flex items-center justify-between gap-3">
            <span className="text-muted-foreground">Show thinking</span>
            <Switch
              checked={showThinking}
              onCheckedChange={setShowThinking}
              aria-label="Show thinking"
            />
          </div>
        </Section>
        {checkpoints.length > 0 && (
          <Section title="Rewind files">
            <div className="mb-1 text-xs leading-snug text-muted-foreground/70">
              Restore the working tree to a past turn (git; a safety snapshot is
              taken first).
            </div>
            <div className="space-y-0.5">
              {checkpoints.map((c) => (
                <div
                  key={c.turnIndex}
                  className="flex items-center justify-between gap-2"
                >
                  <span className="text-muted-foreground">
                    After turn {c.turnIndex}
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      setRewindMsg(null);
                      void rewindRun(
                        run.runId,
                        c.turnIndex,
                        run.cwd ?? "",
                      ).then((r) =>
                        setRewindMsg(
                          r.ok
                            ? `Restored files to turn ${c.turnIndex}.`
                            : (r.error ?? "Rewind failed."),
                        ),
                      );
                    }}
                    className="inline-flex items-center gap-1 rounded-md border border-border/60 px-1.5 py-0.5 text-xs text-muted-foreground transition-colors hover:text-foreground"
                  >
                    <HugeiconsIcon
                      icon={ArrowTurnBackwardIcon}
                      size={11}
                      strokeWidth={2}
                    />
                    Rewind
                  </button>
                </div>
              ))}
            </div>
            {rewindMsg && (
              <div className="mt-1 text-xs text-muted-foreground">
                {rewindMsg}
              </div>
            )}
          </Section>
        )}
        <Section title="Shortcuts" last>
          <Row label="Send">Enter</Row>
          <Row label="Newline">Shift+Enter</Row>
          <Row label="Stop">Esc</Row>
          <Row label="Build plan">⌘↩</Row>
          <Row label="Commands">Type / for custom commands</Row>
        </Section>
      </PopoverContent>
    </Popover>
  );
}

function Section({
  title,
  last,
  children,
}: {
  title: string;
  last?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className={last ? "p-3" : "border-b border-border/60 p-3"}>
      <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground/70">
        {title}
      </div>
      <div className="space-y-0.5">{children}</div>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border/70 bg-muted/25 px-2.5 py-2">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="mt-0.5 truncate font-mono text-xs font-medium text-foreground">
        {value}
      </div>
    </div>
  );
}

function Row({
  label,
  mono,
  children,
}: {
  label: string;
  mono?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <span className="shrink-0 text-muted-foreground">{label}</span>
      <span
        className={`min-w-0 truncate text-right text-foreground ${mono ? "font-mono text-xs" : ""}`}
      >
        {children}
      </span>
    </div>
  );
}
