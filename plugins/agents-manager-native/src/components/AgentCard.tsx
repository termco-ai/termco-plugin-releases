import type { AiLibraryAgent as Agent } from "@termco/ai-library-base";
import ui from "@termco/ui";
import { ICONS as AGENT_ICONS } from "../agentIcons";
import { TOOL_GROUPS } from "../toolGroups";
import {
  Delete02Icon,
  SparklesIcon,
  Tick02Icon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";

const { cn } = ui;

/** Mono chips summarizing which tool groups the agent sees before discovery. */
function toolChips(agent: Agent): string[] {
  if (!agent.preferredToolGroups) return ["Standard tools"];
  const labels = TOOL_GROUPS.filter((g) =>
    agent.preferredToolGroups?.includes(g.id)
  ).map(
    (g) => g.label,
  );
  return labels.length ? labels : ["Standard tools"];
}

/**
 * Grid card for a single agent persona. The whole card activates the agent;
 * the footer holds its tool chips, a delete button (custom only) and an
 * Edit (custom) / View (built-in) affordance.
 */
export function AgentCard({
  agent,
  active,
  onActivate,
  onEdit,
  onDelete,
}: {
  agent: Agent;
  active: boolean;
  onActivate: () => void;
  onEdit: () => void;
  onDelete: (() => void) | null;
}) {
  const Icon = AGENT_ICONS[agent.icon] ?? SparklesIcon;
  return (
    // biome-ignore lint/a11y/useSemanticElements: the card nests real <button>s (edit/delete), which a <button> element can't contain
    <div
      data-onboarding-target="agents-manager.agent-card"
      role="button"
      tabIndex={0}
      onClick={onActivate}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onActivate();
        }
      }}
      className={cn(
        "grid min-h-[82px] cursor-pointer grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 rounded-lg border bg-card p-3 text-left shadow-[var(--shadow-control)] transition-[background-color,border-color]",
        active
          ? "border-ring bg-ring/10"
          : "border-border hover:border-foreground/45 hover:bg-accent/35",
      )}
    >
      <div className="contents">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
          <HugeiconsIcon icon={Icon} size={16} strokeWidth={1.6} />
        </span>
        <div className="min-w-0">
          <div className="flex items-center gap-1.5">
            <span className="truncate font-heading text-base font-semibold text-foreground">
              {agent.name}
            </span>
            <span className="shrink-0 rounded-sm border border-border bg-accent px-1.5 py-0.5 text-xs font-medium text-muted-foreground">
              {agent.builtIn ? "Built-in" : "Custom"}
            </span>
          </div>
          <div className="mt-px truncate font-mono text-xs text-muted-foreground/80">
            {agent.model || "default model"}
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <span
            title={active ? "Active agent" : "Click to activate"}
            className="grid size-[18px] shrink-0 place-items-center"
          >
            {active ? (
              <span
                data-testid="agent-active-check"
                className="grid size-4 place-items-center rounded-full bg-primary text-primary-foreground"
              >
                <HugeiconsIcon icon={Tick02Icon} size={9} strokeWidth={3.5} />
              </span>
            ) : (
              <span className="block size-3.5 rounded-full border-[1.5px] border-foreground/20" />
            )}
          </span>
          {onDelete ? (
            <button
              type="button"
              title="Delete agent"
              onClick={(e) => {
                e.stopPropagation();
                onDelete();
              }}
              className="grid size-7 shrink-0 place-items-center rounded-sm text-muted-foreground transition-colors hover:bg-destructive hover:text-white"
            >
              <HugeiconsIcon icon={Delete02Icon} size={12} strokeWidth={1.75} />
            </button>
          ) : null}
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onEdit();
            }}
            className="h-7 shrink-0 rounded-md border border-border px-2.5 text-xs font-medium text-foreground transition-colors hover:bg-accent"
          >
            {agent.builtIn ? "View" : "Edit"}
          </button>
        </div>
      </div>
      <div className="col-start-2 line-clamp-1 text-xs leading-[1.55] text-muted-foreground">
        {agent.description}
      </div>
      <div className="col-start-2 flex min-w-0 flex-wrap gap-1">
        {toolChips(agent).map((label) => (
          <span
            key={label}
            className="inline-flex h-5 items-center rounded-sm border border-border bg-accent/60 px-1.5 font-mono text-xs text-muted-foreground"
          >
            {label}
          </span>
        ))}
      </div>
    </div>
  );
}
