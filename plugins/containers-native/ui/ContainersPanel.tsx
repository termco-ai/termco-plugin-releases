/**
 * Containers sidebar panel: a card for every container on the active host
 * (local or the SSH rig's remote). Clicking a card opens (or focuses) that
 * container's rich detail tab; the card of the active detail tab is
 * highlighted. Quick actions (shell / start / stop / restart) live inline.
 */
import ui from "@termco/ui";
import { Refresh01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ContainerCard } from "./components/ContainerCard";
import { PanelCenter } from "./components/PanelCenter";
import { openContainerDetail, openContainerShell } from "./lib/containerEvents";
import { isRunningState } from "./lib/runtimeMeta";
import { useActiveContainerTab } from "./store/useActiveContainerTab";
import type { ContainerActionKind, ContainerSummary } from "./types";
import { useContainerPortForward } from "./useContainerPortForward";
import { setStatsTargets, useContainerStats } from "./useContainerStats";
import { rowKey, useContainers } from "./useContainers";

const { Button, Tooltip, TooltipContent, TooltipTrigger, cn } = ui;

const STATS_SOURCE = "sidebar-panel";

export function ContainersPanel() {
  const containers = useContainers();
  const stats = useContainerStats();
  const activeKey = useActiveContainerTab((s) => s.activeKey);
  const portForward = useContainerPortForward();

  const [refreshAnimating, setRefreshAnimating] = useState(false);
  const refreshAnimTimer = useRef<number | null>(null);

  const handleRefresh = useCallback(() => {
    setRefreshAnimating(true);
    void containers.refresh().finally(() => {
      if (refreshAnimTimer.current)
        window.clearTimeout(refreshAnimTimer.current);
      refreshAnimTimer.current = window.setTimeout(
        () => setRefreshAnimating(false),
        450,
      );
    });
  }, [containers]);

  const running = useMemo(
    () => containers.containers.filter((c) => isRunningState(c.state)),
    [containers.containers],
  );

  // Feed the shared stats poller with the running containers; withdraw on
  // unmount so a collapsed sidebar stops driving the poll.
  useEffect(() => {
    setStatsTargets(
      STATS_SOURCE,
      running.map((c) => ({ runtime: c.runtime, id: c.id })),
    );
    return () => setStatsTargets(STATS_SOURCE, []);
  }, [running]);

  const runAction = (c: ContainerSummary, action: ContainerActionKind) =>
    void containers.runAction(c, action);
  const openShell = (c: ContainerSummary) =>
    openContainerShell({ runtime: c.runtime, id: c.id, name: c.name });

  // Clicking a card opens (or focuses) its rich detail tab — like clicking a
  // file opens its editor.
  const openDetail = (c: ContainerSummary) =>
    openContainerDetail({ runtime: c.runtime, id: c.id, name: c.name });

  const summary = `${running.length} running · ${containers.containers.length}`;

  const body = () => {
    if (!containers.loaded && containers.isLoading) {
      return <PanelCenter title="Loading containers…" />;
    }
    if (containers.error) {
      return (
        <PanelCenter
          title="Couldn't list containers"
          body={containers.error}
          action={
            <Button size="sm" variant="outline" onClick={handleRefresh}>
              Retry
            </Button>
          }
        />
      );
    }
    if (!containers.anyRuntimeAvailable) {
      return (
        <PanelCenter
          title="No container runtime detected"
          body="Install and start Docker, Podman, or Apple's container tool to see running containers here."
        />
      );
    }
    if (containers.containers.length === 0) {
      return <PanelCenter title="No containers" body="Nothing to show yet." />;
    }
    return (
      <div className="min-h-0 flex-1 overflow-y-auto p-1.5">
        {containers.containers.map((c) => {
          const key = rowKey(c);
          return (
            <ContainerCard
              key={key}
              container={c}
              active={activeKey === key}
              stats={stats.get(key)}
              busy={containers.busyKey === key}
              portForward={portForward}
              onOpen={() => openDetail(c)}
              onShell={() => openShell(c)}
              onAction={(a) => runAction(c, a)}
            />
          );
        })}
      </div>
    );
  };

  return (
    <div className="termco-panel flex h-full min-h-0 flex-col">
      <div className="termco-toolbar flex h-10 shrink-0 items-center gap-1.5 border-b border-border/70 px-3 pr-2">
        <span className="text-xs font-medium text-foreground/80">
          Containers
        </span>
        {containers.containers.length > 0 ? (
          <span className="inline-flex h-5 items-center rounded-full border border-border/50 px-1.5 text-xs font-semibold tabular-nums text-muted-foreground">
            {summary}
          </span>
        ) : null}
        <div className="ml-auto flex items-center gap-0.5">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon-xs"
                aria-label="Refresh containers"
                disabled={containers.isLoading && !refreshAnimating}
                onClick={handleRefresh}
                className="text-muted-foreground"
              >
                <HugeiconsIcon
                  icon={Refresh01Icon}
                  size={13}
                  strokeWidth={1.9}
                  className={cn(refreshAnimating && "animate-spin")}
                />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom">Refresh</TooltipContent>
          </Tooltip>
        </div>
      </div>
      {body()}
    </div>
  );
}
