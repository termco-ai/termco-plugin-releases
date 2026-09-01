/**
 * A row in the "Agent alerts" section for enabling coding-agent hooks.
 *
 * Shows whether the CLI agent's Termco notification hook is installed and
 * offers an inline Enable action with a spinner while installing.
 */

import {
  CheckmarkCircle02Icon,
  Loading03Icon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { AgentAvatar } from "../AgentAvatar";

export function HookAgentRow({
  id,
  label,
  ready,
  installing,
  onEnable,
}: {
  id: string;
  label: string;
  ready: boolean;
  installing: boolean;
  onEnable: () => void;
}) {
  return (
    <div className="flex items-center gap-2.5 rounded-md px-1.5 py-1.5">
      <AgentAvatar agent={id} size={20} />
      <span className="flex-1 truncate text-xs text-foreground/80">
        {label}
      </span>
      {ready ? (
        <span className="flex items-center gap-1 text-xs font-medium text-primary">
          <HugeiconsIcon
            icon={CheckmarkCircle02Icon}
            size={13}
            strokeWidth={1.75}
          />
          enabled
        </span>
      ) : (
        <button
          type="button"
          onClick={onEnable}
          disabled={installing}
          className="flex items-center gap-1 rounded-[6px] border border-border px-2 py-0.5 text-xs text-muted-foreground transition-colors hover:border-primary hover:text-foreground disabled:opacity-60"
        >
          {installing ? (
            <HugeiconsIcon
              icon={Loading03Icon}
              size={12}
              strokeWidth={1.75}
              className="animate-spin"
            />
          ) : null}
          {installing ? "Enabling" : "Enable"}
        </button>
      )}
    </div>
  );
}
