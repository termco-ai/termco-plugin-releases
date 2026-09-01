import type { AgentActivityCapability } from "@termco/agents-base";
import type { ShortcutRegistryCapability } from "@termco/shortcuts-base";
import type {
  UiHeaderRuntime,
  UiHeaderSearchCapability,
} from "@termco/ui-header-base";
import type { WorkspaceRigOverviewCapability } from "@termco/workspace-base";
import { useMemo, useSyncExternalStore } from "react";
import { ExactHeader } from "./baseline/ExactHeader";

function locationFor(
  tabId: number,
  runtime: UiHeaderRuntime,
): string | null {
  const tab = runtime.allTabs.find((entry) => entry.id === tabId);
  if (!tab) return null;
  const rig = runtime.rigs.find((entry) => entry.id === tab.rigId);
  if (!rig) return tab.label || null;
  return tab.label ? `${rig.name} · ${tab.label}` : rig.name;
}

export function AgentAwareHeader({
  activity,
  runtime,
  rigOverview,
  headerSearch,
  shortcuts,
}: {
  activity: AgentActivityCapability;
  runtime: UiHeaderRuntime;
  rigOverview: WorkspaceRigOverviewCapability;
  headerSearch: UiHeaderSearchCapability;
  shortcuts: ShortcutRegistryCapability;
}) {
  const snapshot = useSyncExternalStore(
    activity.subscribe,
    activity.snapshot,
    activity.snapshot,
  );
  const agentRuntime = useMemo<UiHeaderRuntime>(
    () => ({
      ...runtime,
      agentSessions: [
        ...(snapshot.localAgent
          ? [
              {
                source: "local" as const,
                leafId: 0,
                tabId: 0,
                agent: snapshot.localAgent.agent,
                status: snapshot.localAgent.status,
                location: null,
              },
            ]
          : []),
        ...snapshot.sessions.map((session) => ({
          source: "terminal" as const,
          leafId: session.leafId,
          tabId: session.tabId,
          agent: session.agent,
          status: session.status,
          location: locationFor(session.tabId, runtime),
        })),
      ],
      agentNotifications: snapshot.notifications.map((notification) => ({
        ...notification,
        location:
          notification.source === "local"
            ? null
            : locationFor(notification.tabId, runtime),
      })),
      activateLocalAgent: activity.activateLocalAgent,
      markAgentNotificationsRead: activity.markAllRead,
      clearAgentNotifications: activity.clearNotifications,
    }),
    [activity, runtime, snapshot],
  );
  return (
    <ExactHeader
      runtime={agentRuntime}
      rigOverview={rigOverview}
      headerSearch={headerSearch}
      shortcuts={shortcuts}
    />
  );
}
