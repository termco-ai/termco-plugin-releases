/**
 * A single past-event row in the activity popover.
 *
 * Renders an outcome glyph, the agent name with what happened, where it ran,
 * and a relative timestamp; clicking activates the source agent.
 */

import { cn } from "../../ui";
import {
  AlertCircleIcon,
  CheckmarkCircle02Icon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { displayAgent } from "../format";
import type { AgentNotification } from "../../types";

function relativeTime(ts: number): string {
  const s = Math.floor((Date.now() - ts) / 1000);
  if (s < 60) return "just now";
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

const NOTIF_LABEL: Record<AgentNotification["kind"], string> = {
  attention: "needs input",
  finished: "finished",
  error: "failed",
};

export function NotificationRow({
  n,
  where,
  onClick,
}: {
  n: AgentNotification;
  /** "rig · tab", or null when the owning tab is gone. */
  where?: string | null;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-center gap-2.5 rounded-md px-2 py-2 text-left transition-colors hover:bg-accent"
    >
      <span className="flex w-[22px] shrink-0 items-center justify-center">
        {n.kind === "finished" ? (
          <HugeiconsIcon
            icon={CheckmarkCircle02Icon}
            size={16}
            strokeWidth={1.8}
            className="text-muted-foreground"
          />
        ) : n.kind === "error" ? (
          <HugeiconsIcon
            icon={AlertCircleIcon}
            size={16}
            strokeWidth={1.8}
            className="text-destructive"
          />
        ) : (
          <span className={cn("size-1.5 rounded-full bg-primary")} />
        )}
      </span>
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="truncate text-xs text-foreground">
          {displayAgent(n.agent)}{" "}
          <span className="text-muted-foreground">{NOTIF_LABEL[n.kind]}</span>
        </span>
        {where ? (
          <span className="truncate text-xs text-muted-foreground">
            {where}
          </span>
        ) : null}
      </span>
      <span className="shrink-0 text-xs tabular-nums text-muted-foreground/80">
        {relativeTime(n.at)}
      </span>
    </button>
  );
}
