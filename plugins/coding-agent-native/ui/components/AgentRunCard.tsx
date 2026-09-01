/** Source-owned by the coding-agent-native plugin.
 * A roster card for one coding-agent run: backend avatar, task title, a status
 * badge, live activity while working, and usage once finished. The whole card
 * opens the run; a hover-revealed control removes a finished one.
 */

import ui from "@termco/ui";
import { Cancel01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { type AgentRunView, isRunBusy } from "../store/codingAgentsStore";
import { BackendAvatar } from "./backendMeta";
import {
  ElapsedChip,
  formatUsage,
  liveActivity,
  StatusBadge,
  workspaceLabel,
} from "./runMeta";

const { cn } = ui;

function basename(p: string): string {
  const i = Math.max(p.lastIndexOf("/"), p.lastIndexOf("\\"));
  const name = i >= 0 ? p.slice(i + 1) : p;
  return name || p;
}

export function AgentRunCard({
  run,
  active,
  onOpen,
  onRemove,
}: {
  run: AgentRunView;
  active: boolean;
  onOpen: () => void;
  onRemove: () => void;
}) {
  const busy = isRunBusy(run.status);
  const activity = liveActivity(run);
  const usage = formatUsage(run);

  return (
    // biome-ignore lint/a11y/useSemanticElements: the card nests a real <button> (remove), which a <button> element can't contain
    <div
      className={cn(
        "group relative flex cursor-pointer gap-3 rounded-xl border bg-card p-3 text-left transition-colors",
        active ? "border-primary" : "border-border/60 hover:border-border",
      )}
      role="button"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onOpen();
        }
      }}
    >
      <BackendAvatar backend={run.backend} size={34} />

      <div className="min-w-0 flex-1">
        <div className="flex items-start gap-1.5">
          {run.unseen && !active ? (
            <span
              className="mt-1 size-1.5 shrink-0 rounded-full bg-primary"
              aria-label="Unseen activity"
              title="Unseen activity"
            />
          ) : null}
          <span className="min-w-0 flex-1 truncate text-sm font-semibold text-foreground">
            {run.title}
          </span>
          <StatusBadge status={run.status} className="shrink-0" />
        </div>

        <div className="mt-0.5 flex items-center gap-1.5 font-mono text-xs text-muted-foreground/80">
          {run.model && <span className="truncate">{run.model}</span>}
          {run.model && run.cwd && <span className="opacity-40">·</span>}
          {run.cwd && <span className="truncate">{basename(run.cwd)}</span>}
          {/* Where the run executes — only a remote host earns a mention. */}
          {workspaceLabel(run.workspace) && (
            <>
              <span className="opacity-40">·</span>
              <span
                className="truncate text-sky-600 dark:text-sky-400"
                title={`Runs on ${workspaceLabel(run.workspace)}`}
              >
                {workspaceLabel(run.workspace)}
              </span>
            </>
          )}
        </div>

        <div className="mt-1 flex items-center gap-2">
          {busy && activity ? (
            <span className="min-w-0 flex-1 animate-pulse truncate text-xs text-emerald-600 dark:text-emerald-400">
              {activity}
            </span>
          ) : usage ? (
            <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground/70">
              {usage}
            </span>
          ) : (
            <span className="flex-1" />
          )}
          <ElapsedChip since={run.createdAt} live={busy} />
        </div>
      </div>

      {!busy && (
        <button
          type="button"
          aria-label="Remove run"
          onClick={(e) => {
            e.stopPropagation();
            onRemove();
          }}
          className="absolute top-1.5 right-1.5 rounded p-0.5 text-muted-foreground opacity-0 transition-opacity hover:bg-accent hover:text-foreground group-hover:opacity-70"
        >
          <HugeiconsIcon icon={Cancel01Icon} size={11} strokeWidth={2} />
        </button>
      )}
    </div>
  );
}
