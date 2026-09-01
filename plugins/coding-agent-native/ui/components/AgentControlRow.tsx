/** Source-owned by the coding-agent-native plugin.
 * Mid-session control row above the run composer: change the model, reasoning
 * effort, and autonomy for the next turn. Changes are stored on the run and
 * threaded to the driver as
 * per-turn overrides on the next send (see codingAgentsStore.overridesFrom).
 *
 * The autonomy pill cycles on click or Tab. Menus are `modal={false}` so they
 * don't strand `body{pointer-events}`
 * inside the dock (see the radix-modal-dropdown-pointer-events-lock note).
 */

import ui from "@termco/ui";
import { ArrowDown01Icon, Tick02Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import type { AgentBackend, AgentPermissionMode } from "../lib/protocol";
import type { AgentRunView } from "../store/codingAgentsStore";
import {
  EFFORT_LEVELS,
  MODEL_CATALOG,
  PERMISSION_MODES,
} from "./agentSettings";

const {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  cn,
} = ui;

export function AgentControlRow({
  run,
  onChange,
}: {
  run: AgentRunView;
  onChange: (patch: {
    model?: string;
    permissionMode?: AgentPermissionMode;
    effort?: AgentRunView["effort"];
  }) => void;
}) {
  const backend: AgentBackend = run.backend;
  const models = MODEL_CATALOG[backend];
  const modelLabel =
    models.find((m) => m.id === run.requestedModel)?.label ?? "Default";
  const effortLabel =
    EFFORT_LEVELS.find((e) => e.id === run.effort)?.label ?? "Auto";

  const modeIndex = Math.max(
    0,
    PERMISSION_MODES.findIndex((m) => m.id === run.permissionMode),
  );
  const mode = PERMISSION_MODES[modeIndex];
  const cycleMode = () => {
    const next = PERMISSION_MODES[(modeIndex + 1) % PERMISSION_MODES.length];
    onChange({ permissionMode: next.id });
  };

  return (
    <div className="mb-1.5 flex items-center gap-1 overflow-x-auto">
      {/* Autonomy — click / Tab to cycle. */}
      <button
        type="button"
        onClick={cycleMode}
        onKeyDown={(e) => {
          if (e.key === "Tab" && !e.shiftKey) {
            e.preventDefault();
            cycleMode();
          }
        }}
        title={`${mode.hint} — click to change`}
        className="inline-flex shrink-0 items-center gap-1 rounded-md border border-border/60 bg-card px-1.5 py-1 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
      >
        <span className={cn("size-1.5 rounded-full", mode.dot)} />
        {mode.label}
      </button>

      {/* Model — hidden when the backend offers only Default. */}
      {models.length > 1 && (
        <ControlMenu
          label={modelLabel}
          items={models.map((m) => ({
            key: m.label,
            label: m.label,
            selected: m.id === run.requestedModel,
            onSelect: () => onChange({ model: m.id ?? "" }),
          }))}
        />
      )}

      {/* Reasoning effort. */}
      <ControlMenu
        label={effortLabel}
        items={EFFORT_LEVELS.map((e) => ({
          key: e.label,
          label: e.label,
          selected: e.id === run.effort,
          onSelect: () => onChange({ effort: e.id }),
        }))}
      />
    </div>
  );
}

function ControlMenu({
  label,
  items,
}: {
  label: string;
  items: Array<{
    key: string;
    label: string;
    selected: boolean;
    onSelect: () => void;
  }>;
}) {
  return (
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className="inline-flex shrink-0 items-center gap-0.5 rounded-md border border-border/60 bg-card px-1.5 py-1 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
        >
          {label}
          <HugeiconsIcon icon={ArrowDown01Icon} size={11} strokeWidth={2} />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="min-w-28">
        {items.map((it) => (
          <DropdownMenuItem
            key={it.key}
            onSelect={it.onSelect}
            className="gap-2 text-xs"
          >
            <span className="flex-1">{it.label}</span>
            {it.selected && (
              <HugeiconsIcon
                icon={Tick02Icon}
                size={12}
                strokeWidth={2.5}
                className="text-primary"
              />
            )}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
