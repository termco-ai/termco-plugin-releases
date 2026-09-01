/**
 * One container as a card (sidebar). Clicking the card opens (or focuses) its
 * rich detail tab; the inline action buttons (shell / restart / stop-play) stop
 * propagation so they act without opening. Highlights when its detail tab is
 * the active one. Shows a status dot, image, status, published-port chips, and
 * — while running — live cpu/mem from the shared stats poller.
 */
import ui from "@termco/ui";
import {
  ComputerTerminal02Icon,
  PlayIcon,
  ReloadIcon,
  StopIcon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import type { MouseEvent } from "react";
import { parsePublishedPorts } from "../lib/portsParse";
import {
  formatCpu,
  formatMemShort,
  isRunningState,
  stateDotClass,
  statusTextClass,
} from "../lib/runtimeMeta";
import type { ContainerStats, ContainerSummary } from "../types";
import type { ContainerPortForwardController } from "../useContainerPortForward";
import { PortForwardChip } from "./PortForwardChip";

const { Tooltip, TooltipContent, TooltipTrigger, cn } = ui;

export function ContainerCard({
  container,
  active,
  stats,
  busy,
  portForward,
  onOpen,
  onShell,
  onAction,
}: {
  container: ContainerSummary;
  active: boolean;
  stats: ContainerStats | undefined;
  busy: boolean;
  portForward: ContainerPortForwardController;
  onOpen: () => void;
  onShell: () => void;
  onAction: (action: "restart" | "stop" | "start") => void;
}) {
  const running = isRunningState(container.state);
  const chips = parsePublishedPorts(container.ports);

  const stop = (e: MouseEvent) => e.stopPropagation();

  return (
    // biome-ignore lint/a11y/useKeyWithClickEvents: the detail tab is also reachable via keyboard tab nav; this is a pointer affordance
    // biome-ignore lint/a11y/noStaticElementInteractions: card acts as an openable list item
    <div
      data-onboarding-target="containers.card"
      onClick={onOpen}
      data-active={active}
      data-name={container.name}
      className={cn(
        "group/card mb-1.5 flex cursor-pointer flex-col gap-1.5 rounded-lg border bg-card px-2.5 py-2 shadow-[var(--shadow-control)] transition-colors",
        active
          ? "border-primary/50 bg-[var(--signal-soft)]"
          : "border-border/60 bg-card hover:border-[var(--hairline-strong)] hover:bg-accent/40",
      )}
    >
      <div className="flex items-center gap-2">
        <span
          className={cn(
            "size-[7px] shrink-0 rounded-full",
            stateDotClass(container.state),
          )}
        />
        <span
          className="min-w-0 flex-1 truncate text-xs font-semibold"
          title={container.name}
        >
          {container.name}
        </span>
        {running ? (
          <IconBtn
            label="Open shell in container"
            onClick={(e) => {
              stop(e);
              onShell();
            }}
          >
            <HugeiconsIcon
              icon={ComputerTerminal02Icon}
              size={12}
              strokeWidth={2}
            />
          </IconBtn>
        ) : null}
        <IconBtn
          label="Restart"
          disabled={!running || busy}
          onClick={(e) => {
            stop(e);
            onAction("restart");
          }}
        >
          <HugeiconsIcon icon={ReloadIcon} size={12} strokeWidth={2} />
        </IconBtn>
        <IconBtn
          label={running ? "Stop" : "Start"}
          disabled={busy}
          onClick={(e) => {
            stop(e);
            onAction(running ? "stop" : "start");
          }}
        >
          <HugeiconsIcon
            icon={running ? StopIcon : PlayIcon}
            size={12}
            strokeWidth={2}
          />
        </IconBtn>
      </div>

      <div className="flex items-center gap-2 font-mono text-xs text-muted-foreground">
        <span className="min-w-0 truncate" title={container.image}>
          {container.image}
        </span>
        <span
          className={cn(
            "ml-auto shrink-0 font-sans font-medium",
            statusTextClass(container.state),
          )}
        >
          {container.status}
        </span>
      </div>

      {(chips.length > 0 || (running && stats)) && (
        <div className="flex flex-wrap items-center gap-1.5">
          {chips.map((c) => (
            <PortForwardChip
              key={c.hostPort}
              hostPort={c.hostPort}
              label={c.label}
              forward={portForward.forwardFor(c.hostPort)}
              isSsh={portForward.isSsh}
              onRoute={(choice) => void portForward.route(c.hostPort, choice)}
              onOpen={portForward.open}
              onStop={portForward.stop}
            />
          ))}
          {running && stats ? (
            <span className="ml-auto flex items-center gap-2 font-mono text-xs text-muted-foreground">
              <span>cpu {formatCpu(stats.cpuPerc)}</span>
              <span>mem {formatMemShort(stats.memUsage)}</span>
            </span>
          ) : null}
        </div>
      )}
    </div>
  );
}

function IconBtn({
  label,
  disabled,
  onClick,
  children,
}: {
  label: string;
  disabled?: boolean;
  onClick: (e: MouseEvent) => void;
  children: React.ReactNode;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          aria-label={label}
          disabled={disabled}
          onClick={onClick}
          className="grid size-[22px] shrink-0 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:pointer-events-none disabled:opacity-40"
        >
          {children}
        </button>
      </TooltipTrigger>
      <TooltipContent side="bottom">{label}</TooltipContent>
    </Tooltip>
  );
}
