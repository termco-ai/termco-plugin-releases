import type { TrajectoryNavigationCapability } from "@termco/trajectory-base";
import type {
  UiAiDockRuntime,
  UiAiDockViewContribution,
} from "@termco/ui-dock-base";
import type {
  WorkspaceEnv,
  WorkspaceRigsCapability,
  WorkspaceRigsSnapshot,
  WorkspaceTabRecord,
  WorkspaceTabsCapability,
  WorkspaceTabsSnapshot,
} from "@termco/workspace-base";
import { useSyncExternalStore } from "react";
import { create } from "zustand";

type AgentWorkspaceLike = Parameters<UiAiDockRuntime["openTerminal"]>[1];

let rigs: WorkspaceRigsCapability | null = null;
let tabs: WorkspaceTabsCapability | null = null;
let dockViews = new Map<string, UiAiDockViewContribution>();
let disposeControllers: Array<() => void> = [];

const EMPTY_RIGS: WorkspaceRigsSnapshot = {
  hydrated: false,
  rigs: [],
  activeId: null,
};
const EMPTY_TABS: WorkspaceTabsSnapshot = {
  revision: 0,
  initialized: false,
  tabs: [],
  activeId: 0,
  splitTabId: 0,
  focusedPane: "left",
  booted: false,
  activeRigIdForNewTabs: "",
  activeTabByRig: {},
};

function subscribeRigs(listener: () => void): () => void {
  return rigs?.subscribe(listener) ?? (() => {});
}

function readRigs(): WorkspaceRigsSnapshot {
  return rigs?.snapshot() ?? EMPTY_RIGS;
}

function subscribeTabs(listener: () => void): () => void {
  return tabs?.subscribe(listener) ?? (() => {});
}

function readTabs(): WorkspaceTabsSnapshot {
  return tabs?.snapshot() ?? EMPTY_TABS;
}

type PaneNode = {
  kind?: unknown;
  id?: unknown;
  cwd?: unknown;
  children?: unknown;
  first?: unknown;
  second?: unknown;
};

function activePaneCwd(node: unknown, activeLeafId: unknown): string | null {
  if (!node || typeof node !== "object") return null;
  const pane = node as PaneNode;
  if (pane.kind === "leaf") {
    return pane.id === activeLeafId && typeof pane.cwd === "string"
      ? pane.cwd
      : null;
  }
  if (Array.isArray(pane.children)) {
    for (const child of pane.children) {
      const cwd = activePaneCwd(child, activeLeafId);
      if (cwd) return cwd;
    }
    return null;
  }
  return (
    activePaneCwd(pane.first, activeLeafId) ??
    activePaneCwd(pane.second, activeLeafId)
  );
}

function containingFolder(path: string): string | null {
  const normalized = path.replace(/\\/g, "/");
  const index = normalized.lastIndexOf("/");
  if (index < 0) return null;
  if (index === 0) return "/";
  if (index === 2 && normalized[1] === ":") return normalized.slice(0, 3);
  return normalized.slice(0, index);
}

function openLocation(
  tab: WorkspaceTabRecord | undefined,
  activeRigId: string | null,
): string | null {
  if (!tab || !activeRigId || tab.rigId !== activeRigId) return null;
  const data = tab.data ?? {};
  if (tab.kind === "terminal") {
    return (
      activePaneCwd(data.paneTree, data.activeLeafId) ??
      (typeof data.cwd === "string" ? data.cwd : null)
    );
  }
  if (
    (tab.kind === "editor" || tab.kind === "markdown") &&
    typeof data.path === "string"
  ) {
    return containingFolder(data.path);
  }
  return null;
}

export function aiDockIntegrationsActive(): boolean {
  return rigs !== null || tabs !== null || dockViews.size > 0 || disposeControllers.length > 0;
}

export const useTrajectoryService = create<{
  service: TrajectoryNavigationCapability | null;
}>(() => ({ service: null }));

export const usePendingAgentRun = create<{ pending: string | null }>(() => ({
  pending: null,
}));

export const useCodingAgentsStore = create<{
  runs: readonly unknown[];
  revision: number;
}>(() => ({ runs: [], revision: 0 }));

export const useDockViewLabels = create<{
  agents: string;
  workflows: string;
}>(() => ({ agents: "agents", workflows: "workflows" }));

function publishControllerState(): void {
  const agents = dockViews.get("agents")?.controller;
  usePendingAgentRun.setState({
    pending: agents?.consumeOpenRequest() ? "requested" : null,
  });
  useCodingAgentsStore.setState((state) => ({
    runs: [],
    revision: state.revision + 1,
  }));
}

export function configureDockIntegrations(input: {
  rigs: WorkspaceRigsCapability;
  tabs: WorkspaceTabsCapability;
  views: readonly UiAiDockViewContribution[];
  trajectory: TrajectoryNavigationCapability | null;
}): () => void {
  disposeControllers.splice(0).forEach((dispose) => dispose());
  rigs = input.rigs;
  tabs = input.tabs;
  dockViews = new Map(input.views.map((view) => [view.id, view]));
  useDockViewLabels.setState({
    agents: dockViews.get("agents")?.label ?? "agents",
    workflows: dockViews.get("workflows")?.label ?? "workflows",
  });
  useTrajectoryService.setState({ service: input.trajectory });
  disposeControllers = input.views.flatMap((view) =>
    view.controller ? [view.controller.subscribe(publishControllerState)] : [],
  );
  publishControllerState();

  return () => {
    disposeControllers.splice(0).forEach((dispose) => dispose());
    if (rigs === input.rigs) rigs = null;
    if (tabs === input.tabs) tabs = null;
    dockViews = new Map();
    useDockViewLabels.setState({ agents: "agents", workflows: "workflows" });
    usePendingAgentRun.setState({ pending: null });
    useTrajectoryService.setState({ service: null });
  };
}

export function getLaunchDir(): string | null {
  const snapshot = rigs?.snapshot();
  return snapshot?.rigs.find((rig) => rig.id === snapshot.activeId)?.root ?? null;
}

export function useActiveAgentContext(fallback: string): {
  cwd: string;
  workspace: WorkspaceEnv;
} {
  const rigSnapshot = useSyncExternalStore(subscribeRigs, readRigs, readRigs);
  const tabSnapshot = useSyncExternalStore(subscribeTabs, readTabs, readTabs);
  const active = rigSnapshot.rigs.find(
    (rig) => rig.id === rigSnapshot.activeId,
  );
  const activeTabId = active
    ? (tabSnapshot.activeTabByRig[active.id] ?? tabSnapshot.activeId)
    : tabSnapshot.activeId;
  const activeTab = tabSnapshot.tabs.find((tab) => tab.id === activeTabId);
  return {
    cwd: openLocation(activeTab, active?.id ?? null) ?? active?.root ?? fallback,
    workspace: active?.workspace ?? { kind: "local" },
  };
}

export function countUnseen(_runs: readonly unknown[]): number {
  return dockViews.get("agents")?.controller?.badge() ?? 0;
}

function sameWorkspace(left: WorkspaceEnv, right: AgentWorkspaceLike): boolean {
  if (left == null || right == null) return left == null && right == null;
  if (left.kind !== right.kind) return false;
  if (left.kind === "ssh" && right.kind === "ssh") {
    return left.connectionId === right.connectionId;
  }
  if (left.kind === "wsl" && right.kind === "wsl") {
    return left.distro === right.distro;
  }
  return true;
}

function openTerminal(cwd: string, workspace?: AgentWorkspaceLike): Promise<void> {
  if (!rigs || !tabs) return Promise.resolve();
  const rigSnapshot = rigs.snapshot();
  const rig =
    rigSnapshot.rigs.find((candidate) =>
      sameWorkspace(candidate.workspace, workspace ?? null),
    ) ?? rigSnapshot.rigs.find((candidate) => candidate.id === rigSnapshot.activeId);
  const rigId = rig?.id ?? rigSnapshot.activeId ?? "default";
  const [tabId, leafId] = tabs.allocate(2);
  const snapshot = tabs.snapshot();
  const record = {
    id: tabId,
    rigId,
    kind: "terminal",
    title: "shell",
    data: {
      cwd,
      paneTree: { kind: "leaf", id: leafId, cwd },
      activeLeafId: leafId,
    },
  } as const;
  const next = [...snapshot.tabs, record];
  if (snapshot.initialized) {
    tabs.transition({ tabs: next, activeId: tabId, activeRigIdForNewTabs: rigId });
  } else {
    tabs.initialize({
      tabs: next,
      activeId: tabId,
      splitTabId: 0,
      activeRigIdForNewTabs: rigId,
    });
  }
  return Promise.resolve();
}

function dockRuntime(defaultCwd: string, workspace: WorkspaceEnv): UiAiDockRuntime {
  const snapshot = rigs?.snapshot();
  const active = snapshot?.rigs.find((rig) => rig.id === snapshot.activeId);
  return {
    activeRigId: active?.id ?? snapshot?.activeId ?? null,
    activeRigName: active?.name ?? "Workspace",
    cwd: defaultCwd || active?.root || ".",
    workspace: active?.workspace ?? workspace ?? { kind: "local" },
    openTerminal,
  };
}

export function CodingAgentsPanel(props: {
  defaultCwd: string;
  workspace: WorkspaceEnv;
}) {
  const view = dockViews.get("agents");
  if (!view) {
    return (
      <div className="p-3 text-xs text-muted-foreground">
        Coding-agent UI is not enabled in this profile.
      </div>
    );
  }
  return <view.Component runtime={dockRuntime(props.defaultCwd, props.workspace)} />;
}

export function WorkflowsPanel() {
  const view = dockViews.get("workflows");
  if (!view) {
    return (
      <div className="p-3 text-xs text-muted-foreground">
        Workflow UI is not enabled in this profile.
      </div>
    );
  }
  const context = useActiveAgentContext(getLaunchDir() ?? ".");
  return <view.Component runtime={dockRuntime(context.cwd, context.workspace)} />;
}
