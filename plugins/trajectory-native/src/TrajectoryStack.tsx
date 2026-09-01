import type { UiTabDescriptor, UiTabSurfaceProps } from "@termco/ui-tabs-base";
import type { WorkspaceTabsCapability } from "@termco/workspace-base";
import { forkSessionFrom, rerunSessionFrom, rewindWorkingTree } from "./actions";
import { ForkDialog } from "./ForkDialog";
import { getTrajectoryRuntime } from "./runtime";
import { SearchDialog } from "./SearchDialog";
import { TrajectoryPane } from "./TrajectoryPane";
import { type ForkPrompt, useTrajectoryUi } from "./uiStore";

function tabData(tab: Pick<UiTabDescriptor, "data">): { sessionId: string; eventSeq?: number; recordId?: string } {
  const data = tab.data ?? {};
  return {
    sessionId: typeof data.sessionId === "string" ? data.sessionId : "",
    ...(typeof data.eventSeq === "number" ? { eventSeq: data.eventSeq } : {}),
    ...(typeof data.recordId === "string" ? { recordId: data.recordId } : {}),
  };
}

function title(sessionId: string): string {
  if (!sessionId) return "Sessions";
  return `Trajectory · ${sessionId.length > 18 ? `${sessionId.slice(0, 18)}…` : sessionId}`;
}

export function openTrajectoryTab(
  tabs: WorkspaceTabsCapability,
  sessionId: string,
  eventSeq?: number,
  recordId?: string,
): void {
  const snapshot = tabs.snapshot();
  const existing = snapshot.tabs.find(
    (tab) => tab.kind === "trajectory" && tabData(tab).sessionId === sessionId,
  );
  if (existing) {
    tabs.transition({ activeId: existing.id });
    if (eventSeq !== undefined) useTrajectoryUi.getState().requestHighlight(sessionId, eventSeq);
    return;
  }
  const id = tabs.allocate(1)[0];
  tabs.transition({
    tabs: [
      ...snapshot.tabs,
      {
        id,
        rigId: snapshot.activeRigIdForNewTabs,
        kind: "trajectory",
        title: title(sessionId),
        data: {
          sessionId,
          ...(eventSeq === undefined ? {} : { eventSeq }),
          ...(recordId === undefined ? {} : { recordId }),
        },
      },
    ],
    activeId: id,
  });
  if (eventSeq !== undefined) useTrajectoryUi.getState().requestHighlight(sessionId, eventSeq);
}

async function confirmFork(prompt: ForkPrompt, restore: boolean, tabs: WorkspaceTabsCapability): Promise<void> {
  useTrajectoryUi.getState().setForkPrompt(null);
  try {
    if (restore && prompt.checkpoint) {
      const error = await rewindWorkingTree(prompt.sessionId, prompt.checkpoint);
      if (error) throw new Error(error);
    }
    const result = prompt.mode === "rerun"
      ? await rerunSessionFrom(prompt.sessionId, prompt.eventSeq)
      : await forkSessionFrom(prompt.sessionId, prompt.eventSeq);
    openTrajectoryTab(tabs, result.sessionId);
  } catch (error) {
    console.error("[trajectory] session action failed", error);
  }
}

export function TrajectoryStack({ tabs, activeId }: UiTabSurfaceProps) {
  const active = tabs.find((tab) => tab.kind === "trajectory" && tab.id === activeId);
  const searchOpen = useTrajectoryUi((state) => state.searchOpen);
  const setSearchOpen = useTrajectoryUi((state) => state.setSearchOpen);
  const forkPrompt = useTrajectoryUi((state) => state.forkPrompt);
  const setForkPrompt = useTrajectoryUi((state) => state.setForkPrompt);
  const services = getTrajectoryRuntime();
  const data = active ? tabData(active) : null;
  return (
    <>
      {active && data && (
        <TrajectoryPane
          key={active.id}
          sessionId={data.sessionId}
          initialEventSeq={data.eventSeq}
          initialRecordId={data.recordId}
          history={services.history}
          queryService={services.query}
          onOpenSession={(sessionId, eventSeq, recordId) => openTrajectoryTab(services.tabs, sessionId, eventSeq, recordId)}
        />
      )}
      <SearchDialog
        open={searchOpen}
        onOpenChange={setSearchOpen}
        queryService={services.query}
        onOpenHit={(sessionId, eventSeq, recordId) => openTrajectoryTab(services.tabs, sessionId, eventSeq, recordId)}
      />
      <ForkDialog prompt={forkPrompt} onCancel={() => setForkPrompt(null)} onConfirm={(prompt, restore) => void confirmFork(prompt, restore, services.tabs)} />
    </>
  );
}
