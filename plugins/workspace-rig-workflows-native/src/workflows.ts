import type { SshClientCapability } from "@termco/ssh-base";
import type { TerminalSessionsCapability } from "@termco/terminal-base";
import type {
  WorkspaceEnvironmentCapability,
  WorkspaceRigsCapability,
  WorkspaceRigWorkflowsCapability,
  WorkspaceTabsCapability,
  WorkspaceExecutionCapability,
  WorkspaceEnv,
} from "@termco/workspace-base";

export interface RigWorkflowDependencies {
  rigs: WorkspaceRigsCapability;
  environment: WorkspaceEnvironmentCapability;
  tabs: WorkspaceTabsCapability;
  terminalSessions: TerminalSessionsCapability;
  execution?: WorkspaceExecutionCapability;
  /** Compatibility adapter for direct module tests; runtime composition uses execution. */
  ssh?: Pick<SshClientCapability, "resolveTarget" | "resolveHome">;
  notifyError(title: string, description: string): void;
}

export function createRigWorkflows(
  dependencies: RigWorkflowDependencies,
): WorkspaceRigWorkflowsCapability {
  return {
    createLocal() {
      const rigSnapshot = dependencies.rigs.snapshot();
      const activeRig = rigSnapshot.rigs.find(
        (rig) => rig.id === rigSnapshot.activeId,
      );
      const activeIsLocal = activeRig?.workspace.kind === "local";
      const cwd = activeIsLocal ? focusedTerminalCwd(dependencies.tabs) : null;
      const root = activeIsLocal
        ? (cwd ?? dependencies.environment.snapshot().home)
        : null;
      const rig = dependencies.rigs.create({
        name: `Rig ${rigSnapshot.rigs.length + 1}`,
        root,
        workspace: { kind: "local" },
      });
      dependencies.tabs.transition({ activeRigIdForNewTabs: rig.id });
      dependencies.terminalSessions.open({
        ...(cwd ? { cwd } : {}),
        rigId: rig.id,
      });
      dependencies.rigs.activate(rig.id);
      return rig.id;
    },
    async createSsh(connectionId) {
      const unresolved = {
        kind: "ssh" as const,
        connectionId,
        host: "",
      };
      const target = dependencies.execution
        ? await dependencies.execution.invoke<
            Omit<Extract<NonNullable<WorkspaceEnv>, { kind: "ssh" }>, "kind">
          >(unresolved, {
            domain: "ssh",
            method: "resolveTarget",
            args: [{ connectionId }],
          })
        : dependencies.ssh?.resolveTarget({ connectionId });
      if (!target) {
        dependencies.notifyError(
          `Could not connect to ${connectionId}`,
          "SSH workspace execution is unavailable",
        );
        return null;
      }
      const workspace = { kind: "ssh" as const, ...target };
      let root: string;
      try {
        root = dependencies.execution
          ? await dependencies.execution.invoke<string>(workspace, {
              domain: "ssh",
              method: "resolveHome",
              args: [],
            })
          : await dependencies.ssh!.resolveHome(target);
      } catch (error) {
        dependencies.notifyError(
          `Could not connect to ${connectionId}`,
          error instanceof Error ? error.message : String(error),
        );
        return null;
      }
      await dependencies.environment.adopt(workspace);
      const rig = dependencies.rigs.create({
        name: connectionId,
        root,
        workspace,
      });
      dependencies.tabs.transition({ activeRigIdForNewTabs: rig.id });
      dependencies.terminalSessions.open({ cwd: root, rigId: rig.id });
      dependencies.rigs.activate(rig.id);
      return rig.id;
    },
    remove(rigId) {
      const rigSnapshot = dependencies.rigs.snapshot();
      if (
        rigSnapshot.rigs.length === 1 &&
        rigSnapshot.rigs[0]?.id === rigId
      )
        return;
      const tabsSnapshot = dependencies.tabs.snapshot();
      const removed = tabsSnapshot.tabs.filter((tab) => tab.rigId === rigId);
      dependencies.rigs.remove(rigId);
      void dependencies.tabs.deleteLayout(rigId);
      const rigsSnapshot = dependencies.rigs.snapshot();
      const fallbackRigId = rigsSnapshot.activeId;
      if (!fallbackRigId || removed.length === 0) return;
      const fallbackRoot = rigsSnapshot.rigs.find(
        (rig) => rig.id === fallbackRigId,
      )?.root;
      let tabs = tabsSnapshot.tabs.filter((tab) => tab.rigId !== rigId);
      let activeId = tabsSnapshot.activeId;
      const inFallback = tabs.filter((tab) => tab.rigId === fallbackRigId);
      if (inFallback.length === 0) {
        const [tabId, leafId] = dependencies.tabs.allocate(2);
        tabs = [
          ...tabs,
          {
            id: tabId,
            rigId: fallbackRigId,
            kind: "terminal",
            title: fallbackRoot ? pathName(fallbackRoot) : "shell",
            cold: true,
            data: {
              cwd: fallbackRoot ?? undefined,
              paneTree: {
                kind: "leaf",
                id: leafId,
                cwd: fallbackRoot ?? undefined,
              },
              activeLeafId: leafId,
            },
          },
        ];
        activeId = tabId;
      } else if (!tabs.some((tab) => tab.id === activeId)) {
        activeId = inFallback[inFallback.length - 1].id;
      }
      dependencies.tabs.transition({ tabs, activeId });
      for (const tab of removed) {
        if (tab.kind !== "terminal") continue;
        for (const leafId of terminalLeafIds(tab.data?.paneTree)) {
          dependencies.terminalSessions.dispose(leafId);
        }
      }
    },
  };
}

function pathName(path: string): string {
  const normalized = path.replace(/\\/g, "/").replace(/\/+$/, "");
  return normalized.slice(normalized.lastIndexOf("/") + 1) || "shell";
}

function terminalLeafIds(value: unknown): number[] {
  if (!value || typeof value !== "object") return [];
  const node = value as {
    kind?: unknown;
    id?: unknown;
    first?: unknown;
    second?: unknown;
  };
  if (node.kind === "leaf" && Number.isSafeInteger(node.id)) {
    return [node.id as number];
  }
  if (node.kind !== "split") return [];
  return [
    ...terminalLeafIds(node.first),
    ...terminalLeafIds(node.second),
  ];
}

function focusedTerminalCwd(tabs: WorkspaceTabsCapability): string | null {
  const snapshot = tabs.snapshot();
  const focusedId =
    snapshot.splitTabId !== 0 && snapshot.focusedPane === "right"
      ? snapshot.splitTabId
      : snapshot.activeId;
  const active = snapshot.tabs.find((tab) => tab.id === focusedId);
  if (!active || active.kind !== "terminal") return null;
  const leafId = active.data?.activeLeafId;
  if (!Number.isSafeInteger(leafId)) return null;
  return leafCwd(active.data?.paneTree, leafId as number);
}

function leafCwd(value: unknown, leafId: number): string | null {
  if (!value || typeof value !== "object") return null;
  const node = value as {
    kind?: unknown;
    id?: unknown;
    cwd?: unknown;
    first?: unknown;
    second?: unknown;
  };
  if (node.kind === "leaf") {
    return node.id === leafId && typeof node.cwd === "string" ? node.cwd : null;
  }
  if (node.kind !== "split") return null;
  return leafCwd(node.first, leafId) ?? leafCwd(node.second, leafId);
}
