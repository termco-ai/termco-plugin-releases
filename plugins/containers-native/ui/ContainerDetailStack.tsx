/**
 * Stacks every open container-detail tab (like EditorStack for files): all
 * mounted, the active one visible, the rest hidden but retained so their inspect
 * cache and scroll survive tab switches. Sources the live container list + the
 * shared stats poller once; feeds the active tab's running container as a stats
 * target and gates log polling to the active tab.
 */
import ui from "@termco/ui";
import type { UiTabDescriptor } from "@termco/ui-tabs-base";
import { useEffect, useMemo } from "react";
import { ContainerDetail } from "./ContainerDetail";
import { openContainerShell } from "./lib/containerEvents";
import { isRunningState } from "./lib/runtimeMeta";
import type { ContainerActionKind, ContainerSummary } from "./types";
import { setStatsTargets, useContainerStats } from "./useContainerStats";
import { rowKey, useContainers } from "./useContainers";

const { cn } = ui;

const STATS_SOURCE = "detail-stack";

export function ContainerDetailStack({
  tabs,
  activeId,
}: {
  tabs: readonly UiTabDescriptor[];
  activeId: number;
}) {
  const containers = useContainers();
  const stats = useContainerStats();

  const containerTabs = useMemo(
    () => tabs.filter((t) => t.kind === "container"),
    [tabs],
  );

  const byKey = useMemo(() => {
    const m = new Map<string, ContainerSummary>();
    for (const c of containers.containers) m.set(rowKey(c), c);
    return m;
  }, [containers.containers]);

  // Only the active tab's running container needs stats from this surface (the
  // sidebar panel feeds the rest). Withdraw the source on unmount.
  const activeTab = containerTabs.find((t) => t.id === activeId);
  const activeData = activeTab?.data as { runtime?: string; containerId?: string; name?: string } | undefined;
  const activeKey =
    activeTab && activeData?.runtime && activeData.containerId
      ? `${activeData.runtime}:${activeData.containerId}`
      : null;
  const activeSummary = activeKey ? byKey.get(activeKey) : undefined;
  const activeRunning = activeSummary
    ? isRunningState(activeSummary.state)
    : false;

  useEffect(() => {
    if (activeTab?.kind === "container" && activeRunning && activeData?.runtime && activeData.containerId) {
      setStatsTargets(STATS_SOURCE, [
        { runtime: activeData.runtime as import("./types").ContainerRuntime, id: activeData.containerId },
      ]);
    } else {
      setStatsTargets(STATS_SOURCE, []);
    }
    return () => setStatsTargets(STATS_SOURCE, []);
  }, [activeData?.containerId, activeData?.runtime, activeRunning]);

  return (
    <div className="relative h-full min-h-0">
      {containerTabs.map((t) => {
        if (t.kind !== "container") return null;
        const data = t.data as { runtime?: string; containerId?: string; name?: string };
        if (!data.runtime || !data.containerId) return null;
        const runtime = data.runtime as import("./types").ContainerRuntime;
        const containerId = data.containerId;
        const key = `${runtime}:${containerId}`;
        const summary = byKey.get(key);
        const isActive = t.id === activeId;
        const runAction = (action: ContainerActionKind) => {
          if (summary) void containers.runAction(summary, action);
        };
        return (
          <div
            key={t.id}
            className={cn(
              "absolute inset-0",
              !isActive && "invisible pointer-events-none",
            )}
            aria-hidden={!isActive}
          >
            <ContainerDetail
              runtime={runtime}
              containerId={containerId}
              name={summary?.name ?? data.name ?? t.title}
              state={summary?.state ?? ""}
              status={summary?.status ?? ""}
              image={summary?.image ?? ""}
              listLoaded={containers.loaded}
              stats={stats.get(key)}
              busy={containers.busyKey === key}
              active={isActive}
              onShell={() =>
                openContainerShell({
                  runtime,
                  id: containerId,
                  name: summary?.name ?? data.name ?? t.title,
                })
              }
              onAction={runAction}
            />
          </div>
        );
      })}
    </div>
  );
}
