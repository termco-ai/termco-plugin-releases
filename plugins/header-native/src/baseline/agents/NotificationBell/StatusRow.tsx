/**
 * A single live-agent row in the activity popover.
 *
 * Shows the agent's brand chip, its display name and where it runs, then either
 * a "Jump in" call to action (it is blocked on you) or a quiet working
 * indicator. Clicking anywhere activates the owning terminal leaf.
 */

import { AgentAvatar } from "../AgentAvatar";
import { displayAgent } from "../format";
import type { AgentStatus } from "../../types";

export function StatusRow({
  agent,
  status,
  where,
  onClick,
}: {
  agent: string;
  status: AgentStatus;
  /** "rig · tab", or null when the owning tab is gone. */
  where?: string | null;
  onClick: () => void;
}) {
  const waiting = status === "waiting";
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-center gap-2.5 rounded-md px-2 py-2 text-left transition-colors hover:bg-accent"
    >
      <AgentAvatar agent={agent} />
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="truncate text-xs text-foreground">
          {displayAgent(agent)}
        </span>
        {where ? (
          <span className="truncate text-xs text-muted-foreground">
            {where}
          </span>
        ) : null}
      </span>
      {waiting ? (
        <span className="flex h-[26px] shrink-0 items-center gap-1.5 rounded-[7px] bg-primary px-2.5 text-xs font-semibold text-primary-foreground">
          <span className="size-1.5 animate-pulse rounded-full bg-primary-foreground" />
          Jump in
        </span>
      ) : (
        <span className="flex shrink-0 items-center gap-0.5 text-xs text-muted-foreground">
          working
          <WorkingDots />
        </span>
      )}
    </button>
  );
}

/** Three dots fading in sequence — "still going, nothing needed from you". */
function WorkingDots() {
  return (
    <span className="flex gap-px" aria-hidden>
      {[0, 200, 400].map((delay) => (
        <span
          key={delay}
          className="animate-pulse"
          style={{ animationDelay: `${delay}ms` }}
        >
          ·
        </span>
      ))}
    </span>
  );
}
