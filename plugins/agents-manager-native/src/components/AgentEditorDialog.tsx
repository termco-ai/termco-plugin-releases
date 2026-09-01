import type {
  AiAgentIconId as AgentIconId,
  AiLibraryAgent as Agent,
} from "@termco/ai-library-base";
import ui from "@termco/ui";
import { ICONS as AGENT_ICONS } from "../agentIcons";
import { MODELS } from "../models";
import {
  TOOL_GROUPS,
  type ToolGroupId,
} from "../toolGroups";
import {
  Cancel01Icon,
  SparklesIcon,
  Tick02Icon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useEffect, useState } from "react";

const {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogTitle,
  Input,
  Textarea,
  cn,
} = ui;

const ICON_OPTIONS: AgentIconId[] = [
  "coder",
  "architect",
  "reviewer",
  "security",
  "designer",
  "debugger",
  "tester",
  "refactor",
  "devops",
  "explainer",
  "spark",
];

function FieldLabel({ children }: { children: React.ReactNode }) {
  return (
    <span className="text-xs font-semibold text-foreground/85">{children}</span>
  );
}

/**
 * Modal editor for creating or editing a custom agent, and a read-only view
 * for built-ins. Edits a local draft and only commits (as a non-built-in
 * agent) on Save; requires a name and instructions. Rendering is gated on a
 * non-null `agent`.
 */
export function AgentEditorDialog({
  agent,
  existing,
  onClose,
  onSave,
}: {
  agent: Agent | null;
  existing: Agent[];
  onClose: () => void;
  onSave: (a: Agent) => void;
}) {
  const [draft, setDraft] = useState<Agent | null>(agent);
  useEffect(() => setDraft(agent), [agent]);
  if (!draft) return null;

  const readOnly = draft.builtIn;
  const isNew = !readOnly && !existing.some((a) => a.id === draft.id);
  const canSave =
    draft.name.trim().length > 0 && draft.instructions.trim().length > 0;
  const HeaderIcon = AGENT_ICONS[draft.icon] ?? SparklesIcon;
  const preferredTools: readonly ToolGroupId[] = draft.preferredToolGroups ?? [];

  const toggleTool = (id: ToolGroupId) => {
    const next = preferredTools.includes(id)
      ? preferredTools.filter((g) => g !== id)
      : [...preferredTools, id];
    setDraft({
      ...draft,
      preferredToolGroups: next.length > 0 ? next : undefined,
    });
  };

  const title = readOnly ? draft.name : isNew ? "New agent" : "Edit agent";
  const subtitle = readOnly
    ? "Built-in agent — read-only"
    : "Stored locally and available in every workspace.";

  return (
    <Dialog open={!!agent} onOpenChange={(o) => !o && onClose()}>
      <DialogContent
        showCloseButton={false}
        className="w-[560px] max-w-[calc(100vw-48px)] gap-0 overflow-hidden rounded-xl p-0 sm:max-w-[560px]"
      >
        {/* Header */}
        <div className="termco-toolbar flex items-center gap-2.5 border-b border-border/70 px-4 py-3.5">
          <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-[var(--signal-soft)] text-primary">
            <HugeiconsIcon icon={HeaderIcon} size={15} strokeWidth={1.6} />
          </span>
          <div className="min-w-0 flex-1">
            <DialogTitle className="text-sm font-semibold text-foreground">
              {title}
            </DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground">
              {subtitle}
            </DialogDescription>
          </div>
          <DialogClose asChild>
            <button
              type="button"
              title="Close (Esc)"
              className="grid size-6 shrink-0 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            >
              <HugeiconsIcon icon={Cancel01Icon} size={12} strokeWidth={2} />
            </button>
          </DialogClose>
        </div>

        {/* Body */}
        <div className="flex max-h-[calc(100vh-16rem)] flex-col gap-3.5 overflow-y-auto p-4">
          <div className="flex flex-col gap-1.5">
            <FieldLabel>Name</FieldLabel>
            <Input
              value={draft.name}
              disabled={readOnly}
              onChange={(e) => setDraft({ ...draft, name: e.target.value })}
              className="h-8 text-xs"
              placeholder="e.g. Docs writer"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <FieldLabel>Description</FieldLabel>
            <Input
              value={draft.description}
              disabled={readOnly}
              onChange={(e) =>
                setDraft({ ...draft, description: e.target.value })
              }
              placeholder="One line on what this agent is for"
              className="h-8 text-xs"
            />
          </div>
          {!readOnly && (
            <div className="flex flex-col gap-1.5">
              <FieldLabel>Icon</FieldLabel>
              <div className="flex flex-wrap gap-1.5">
                {ICON_OPTIONS.map((id) => {
                  const Icon = AGENT_ICONS[id] ?? SparklesIcon;
                  const active = draft.icon === id;
                  return (
                    <button
                      key={id}
                      type="button"
                      onClick={() => setDraft({ ...draft, icon: id })}
                      className={cn(
                        "flex size-7 items-center justify-center rounded-md border transition-colors",
                        active
                          ? "border-primary bg-primary/12 text-primary"
                          : "border-border/70 text-muted-foreground hover:bg-accent hover:text-foreground",
                      )}
                    >
                      <HugeiconsIcon icon={Icon} size={13} strokeWidth={1.75} />
                    </button>
                  );
                })}
              </div>
            </div>
          )}
          <div className="flex flex-col gap-1.5">
            <FieldLabel>Model</FieldLabel>
            <select
              value={draft.model ?? ""}
              disabled={readOnly}
              onChange={(e) =>
                setDraft({ ...draft, model: e.target.value || undefined })
              }
              className="termco-focus-ring h-8 rounded-md border border-border/70 bg-card px-2.5 font-mono text-xs text-foreground outline-none disabled:opacity-60"
            >
              <option value="">Default (use the selected model)</option>
              {MODELS.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.label}
                </option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-1.5">
            <FieldLabel>Tools shown immediately</FieldLabel>
            <span className="text-xs text-muted-foreground">
              Other authorized tools remain available through search.
            </span>
            <div className="grid grid-cols-2 gap-1.5">
              {TOOL_GROUPS.map((g) => {
                const on = preferredTools.includes(g.id);
                return (
                  <button
                    key={g.id}
                    type="button"
                    disabled={readOnly}
                    aria-pressed={on}
                    onClick={() => toggleTool(g.id)}
                    className={cn(
                      "flex items-center gap-2 rounded-md border bg-background px-2.5 py-2 text-left transition-colors disabled:cursor-default disabled:opacity-60",
                      on
                        ? "border-primary bg-[var(--signal-soft)]"
                        : "border-border/70",
                    )}
                  >
                    <span className="flex size-4 shrink-0 items-center justify-center">
                      {on ? (
                        <span className="grid size-3.5 place-items-center rounded bg-primary text-primary-foreground">
                          <HugeiconsIcon
                            icon={Tick02Icon}
                            size={9}
                            strokeWidth={3.5}
                          />
                        </span>
                      ) : (
                        <span className="block size-3.5 rounded border border-foreground/20" />
                      )}
                    </span>
                    <span className="flex min-w-0 flex-1 flex-col">
                      <span className="text-xs font-medium text-foreground">
                        {g.label}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {g.hint}
                      </span>
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
          <div className="flex flex-col gap-1.5">
            <FieldLabel>System prompt</FieldLabel>
            <Textarea
              value={draft.instructions}
              disabled={readOnly}
              onChange={(e) =>
                setDraft({ ...draft, instructions: e.target.value })
              }
              placeholder="You are a focused agent that…"
              className="min-h-24 resize-y bg-background text-xs leading-[1.55]"
            />
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center gap-2 border-t border-border/50 px-4 py-3">
          <span className="font-mono text-xs text-muted-foreground/70">
            termco-ai-agents.json
          </span>
          <span className="flex-1" />
          <button
            type="button"
            onClick={onClose}
            className="h-8 rounded-md border border-border/80 bg-card px-3 text-xs font-medium text-foreground shadow-[var(--shadow-control)] transition-colors hover:bg-accent"
          >
            {readOnly ? "Close" : "Cancel"}
          </button>
          {!readOnly && (
            <button
              type="button"
              disabled={!canSave}
              onClick={() => onSave({ ...draft, builtIn: false })}
              className="h-8 rounded-md bg-primary px-3.5 text-xs font-medium text-primary-foreground shadow-[var(--shadow-control)] transition-opacity disabled:opacity-50"
            >
              Save
            </button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
