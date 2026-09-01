/**
 * Agent chooser. Agents are presented as working modes with descriptions,
 * rather than a flat settings-like dropdown.
 */

import { Button } from "@termco/ui";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@termco/ui";
import { cn } from "@termco/ui";
import { openAgentsView } from "../../runtime/agentsView";
import {
  ArrowDown01Icon,
  ArrowRight01Icon,
  Settings01Icon,
  SparklesIcon,
  Tick02Icon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useState } from "react";
import type { AiLibraryAgent as Agent } from "@termco/ai-library-base";
import { useAgentsStore } from "../../store/agentsStore";
import { ICONS } from "./icons";

export function AgentSwitcher({ isMiniWindow }: { isMiniWindow?: boolean }) {
  const list = useAgentsStore((state) => state.agents);
  const activeId = useAgentsStore((state) => state.activeId);
  const setActiveId = useAgentsStore((state) => state.setActiveId);
  const [open, setOpen] = useState(false);

  const active = list.find((agent) => agent.id === activeId) ?? list[0];
  const builtIn = list.filter((agent) => agent.builtIn);
  const custom = list.filter((agent) => !agent.builtIn);
  const ActiveIcon = active ? (ICONS[active.icon] ?? SparklesIcon) : SparklesIcon;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          data-onboarding-target="ai-chat.agent"
          size="xs"
          variant={isMiniWindow ? "ghost" : "outline"}
          className={cn(
            "flex h-7 min-w-0 items-center gap-1.5 rounded-md px-2 text-xs",
            isMiniWindow
              ? "mr-1 text-muted-foreground"
              : "border-border/70 bg-card text-muted-foreground",
          )}
          title={`Agent: ${active?.name ?? "Loading…"}`}
        >
          <HugeiconsIcon icon={ActiveIcon} size={12} strokeWidth={1.75} />
          <span className="max-w-[7rem] truncate font-medium">
            {active?.name ?? "Loading…"}
          </span>
          <HugeiconsIcon
            icon={ArrowDown01Icon}
            size={10}
            strokeWidth={2}
            className="opacity-70"
          />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        sideOffset={7}
        className="w-80 gap-0 overflow-hidden p-0"
      >
        <div className="border-b border-border/70 px-3.5 py-3">
          <p className="text-xs font-semibold text-foreground">Agent mode</p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Choose the instructions and tools for the next request.
          </p>
        </div>
        <div className="max-h-80 overflow-y-auto p-1.5">
          <GroupLabel>Built in</GroupLabel>
          {builtIn.map((agent) => (
            <AgentRow
              key={agent.id}
              agent={agent}
              active={agent.id === activeId}
              onSelect={() => {
                setActiveId(agent.id);
                setOpen(false);
              }}
            />
          ))}
          {custom.length > 0 ? (
            <>
              <div className="my-1 border-t border-border/60" />
              <GroupLabel>Your agents</GroupLabel>
              {custom.map((agent) => (
                <AgentRow
                  key={agent.id}
                  agent={agent}
                  active={agent.id === activeId}
                  onSelect={() => {
                    setActiveId(agent.id);
                    setOpen(false);
                  }}
                />
              ))}
            </>
          ) : null}
        </div>
        <button
          type="button"
          onClick={() => {
            setOpen(false);
            openAgentsView();
          }}
          className="group flex w-full items-center gap-2 border-t border-border/70 bg-muted/20 px-3 py-2.5 text-left text-xs text-muted-foreground transition-colors hover:bg-muted/40 hover:text-foreground"
        >
          <HugeiconsIcon icon={Settings01Icon} size={13} strokeWidth={1.75} />
          <span className="flex-1">Create and manage agents</span>
          <HugeiconsIcon
            icon={ArrowRight01Icon}
            size={12}
            strokeWidth={1.75}
            className="transition-transform group-hover:translate-x-0.5"
          />
        </button>
      </PopoverContent>
    </Popover>
  );
}

function GroupLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="px-2 pb-1 pt-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground/70">
      {children}
    </div>
  );
}

function AgentRow({
  agent,
  active,
  onSelect,
}: {
  agent: Agent;
  active: boolean;
  onSelect: () => void;
}) {
  const Icon = ICONS[agent.icon] ?? SparklesIcon;
  return (
    <button
      type="button"
      role="menuitem"
      onClick={onSelect}
      className={cn(
        "flex w-full items-start gap-3 rounded-lg border px-2.5 py-2 text-left transition-colors",
        active
          ? "border-primary/25 bg-[var(--signal-soft)]"
          : "border-transparent hover:border-border hover:bg-muted/30",
      )}
    >
      <span className="grid size-8 shrink-0 place-items-center rounded-md border border-border/70 bg-background text-muted-foreground">
        <HugeiconsIcon icon={Icon} size={15} strokeWidth={1.7} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-xs font-medium text-foreground">
          {agent.name}
        </span>
        <span className="mt-0.5 block line-clamp-2 text-xs leading-relaxed text-muted-foreground">
          {agent.description || "Custom instructions for this workspace."}
        </span>
      </span>
      {active ? (
        <HugeiconsIcon
          icon={Tick02Icon}
          size={13}
          strokeWidth={2}
          className="mt-1 shrink-0 text-primary"
        />
      ) : null}
    </button>
  );
}
