/**
 * The header notification bell and its activity popover.
 *
 * Aggregates live agent sessions and past notifications into a badge count,
 * lets the user jump to any agent, and manages the "Alert hooks" enablement
 * for the built-in CLI agents. Row rendering is delegated to the sibling
 * `StatusRow`, `NotificationRow`, and `HookAgentRow` components.
 *
 * The hooks section is collapsed by default: it is setup, not activity, and
 * shouldn't push the actual events out of view.
 */

import { Button } from "../../ui";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "../../ui";
import {
  ArrowRight01Icon,
  Notification01Icon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useMemo, useState } from "react";
import { displayAgent } from "../format";
import type {
  AgentNotification,
  HeaderRuntime,
} from "../../types";
import { headerDependencies } from "../../runtime";
import { HookAgentRow } from "./HookAgentRow";
import { NotificationRow } from "./NotificationRow";
import { StatusRow } from "./StatusRow";

type Props = {
  runtime: HeaderRuntime;
  onActivate: (tabId: number, leafId: number) => void;
  onActivateLocal: () => void;
  /** Resolves a tab id to a "rig · tab" line; omit to hide the location. */
  locate?: (tabId: number) => string | null;
};

const HOOK_AGENTS = ["claude", "codex", "gemini"] as const;

export function NotificationBell({
  runtime,
  onActivate,
  onActivateLocal,
  locate,
}: Props) {
  const [open, setOpen] = useState(false);
  const [hooks, setHooks] = useState<Record<string, boolean>>({});
  const [installing, setInstalling] = useState<string | null>(null);
  const [hooksOpen, setHooksOpen] = useState(false);
  const active = useMemo(
    () => runtime.agentSessions.filter((session) => session.source === "terminal"),
    [runtime.agentSessions],
  );
  const localAgent = runtime.agentSessions.find((session) => session.source === "local") ?? null;
  const notifications = runtime.agentNotifications;
  const markAllRead = runtime.markAgentNotificationsRead;
  const clearNotifications = runtime.clearAgentNotifications;
  const activeCount = active.length + (localAgent ? 1 : 0);
  const waitingCount =
    active.filter((s) => s.status === "waiting").length +
    (localAgent?.status === "waiting" ? 1 : 0);
  // attention maps to an active waiting session, so only completed events add
  // to the badge to avoid double-counting.
  const unreadDone = notifications.filter(
    (n) => !n.read && n.kind !== "attention",
  ).length;
  const badge = waitingCount + unreadDone;
  const hooksReady = HOOK_AGENTS.filter((id) => hooks[id] === true).length;

  const refreshHooks = () => {
    for (const id of HOOK_AGENTS) {
      Promise.resolve(headerDependencies().agentHooks.status(id))
        .then((ok) => setHooks((h) => ({ ...h, [id]: ok })))
        .catch(() => setHooks((h) => ({ ...h, [id]: false })));
    }
  };

  const onOpenChange = (next: boolean) => {
    setOpen(next);
    if (next) {
      markAllRead();
      refreshHooks();
    }
  };

  const enableHooks = async (id: string) => {
    setInstalling(id);
    try {
      await Promise.resolve(headerDependencies().agentHooks.enable(id));
      setHooks((h) => ({ ...h, [id]: true }));
    } catch {
      setHooks((h) => ({ ...h, [id]: false }));
    } finally {
      setInstalling(null);
    }
  };

  const activate = (tabId: number, leafId: number) => {
    onActivate(tabId, leafId);
    setOpen(false);
  };

  const activateLocal = () => {
    onActivateLocal();
    setOpen(false);
  };

  const activateNotification = (n: AgentNotification) => {
    if (n.source === "local") activateLocal();
    else activate(n.tabId, n.leafId);
  };

  const where = (tabId: number) => locate?.(tabId) ?? null;
  const empty = activeCount === 0 && notifications.length === 0;

  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="relative size-7 shrink-0 rounded-md text-muted-foreground hover:bg-accent hover:text-foreground"
          title="Agent activity"
        >
          <HugeiconsIcon
            icon={Notification01Icon}
            size={16}
            strokeWidth={1.75}
          />
          {badge > 0 ? (
            <span className="absolute -top-0.5 -right-0.5 flex h-3.5 min-w-3.5 items-center justify-center rounded-full bg-primary px-0.5 text-xs font-semibold leading-none text-primary-foreground">
              {badge > 9 ? "9+" : badge}
            </span>
          ) : null}
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        sideOffset={8}
        className="w-85 gap-0 overflow-hidden p-0"
      >
        <div className="flex items-center gap-2 px-3.5 pt-3 pb-2.5">
          <span className="text-sm font-semibold text-foreground">
            Activity
          </span>
          {activeCount > 0 ? (
            <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-semibold tabular-nums text-primary">
              {activeCount} live
            </span>
          ) : null}
          {notifications.length > 0 ? (
            <button
              type="button"
              onClick={clearNotifications}
              className="ml-auto rounded-md px-1.5 py-0.5 text-xs text-muted-foreground transition-colors hover:text-foreground"
            >
              Clear all
            </button>
          ) : null}
        </div>

        {empty ? (
          <div className="border-t border-border/60 px-3.5 py-6 text-center text-xs leading-relaxed text-muted-foreground">
            No agent activity yet.
            <br />
            Run the Termco agent or a coding agent to track it here.
          </div>
        ) : (
          <div className="max-h-85 overflow-y-auto px-2 pb-2">
            {activeCount > 0 ? (
              <>
                <GroupLabel>Working now</GroupLabel>
                {localAgent ? (
                  <StatusRow
                    agent={localAgent.agent}
                    status={localAgent.status}
                    onClick={activateLocal}
                  />
                ) : null}
                {active.map((s) => (
                  <StatusRow
                    key={s.leafId}
                    agent={s.agent}
                    status={s.status}
                    where={where(s.tabId)}
                    onClick={() => activate(s.tabId, s.leafId)}
                  />
                ))}
              </>
            ) : null}
            {notifications.length > 0 ? (
              <>
                <GroupLabel>Earlier</GroupLabel>
                {notifications.map((n) => (
                  <NotificationRow
                    key={n.id}
                    n={n}
                    where={n.source === "local" ? null : where(n.tabId)}
                    onClick={() => activateNotification(n)}
                  />
                ))}
              </>
            ) : null}
          </div>
        )}

        <div className="border-t border-border/60 bg-muted/30 p-2">
          <button
            type="button"
            onClick={() => setHooksOpen((v) => !v)}
            aria-expanded={hooksOpen}
            className="flex w-full items-center gap-1.5 px-1.5 py-1 text-left"
          >
            <HugeiconsIcon
              icon={ArrowRight01Icon}
              size={12}
              strokeWidth={2.2}
              className={`shrink-0 text-muted-foreground transition-transform ${
                hooksOpen ? "rotate-90" : ""
              }`}
            />
            <span className="flex-1 text-xs font-semibold tracking-[0.06em] text-muted-foreground uppercase">
              Alert hooks
            </span>
            <span className="text-xs tabular-nums text-muted-foreground/80">
              {hooksReady}/{HOOK_AGENTS.length} on
            </span>
          </button>
          {hooksOpen ? (
            <div className="mt-0.5 flex flex-col gap-px">
              {HOOK_AGENTS.map((id) => (
                <HookAgentRow
                  key={id}
                  id={id}
                  label={displayAgent(id)}
                  ready={hooks[id] === true}
                  installing={installing === id}
                  onEnable={() => enableHooks(id)}
                />
              ))}
            </div>
          ) : null}
        </div>
      </PopoverContent>
    </Popover>
  );
}

function GroupLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="px-1.5 pt-2 pb-1 text-xs font-semibold tracking-[0.08em] text-muted-foreground/70 uppercase">
      {children}
    </div>
  );
}
