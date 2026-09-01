import type { SshClientCapability } from "@termco/ssh-base";
import type { TerminalSessionsCapability } from "@termco/terminal-base";
import type {
  WorkspaceCapability,
  WorkspaceEnvironmentCapability,
  WorkspaceEnvironmentSnapshot,
  WorkspaceRigsCapability,
  WorkspaceTabsCapability,
  WorkspaceExecutionCapability,
  SelectedWorkspaceEnvironment,
} from "@termco/workspace-base";

export interface WorkspaceEnvironmentDependencies {
  workspace: WorkspaceCapability;
  execution?: WorkspaceExecutionCapability;
  /** Compatibility adapter for direct module tests; runtime composition uses execution. */
  ssh?: Pick<SshClientCapability, "resolveHome">;
  rigs: WorkspaceRigsCapability;
  tabs: WorkspaceTabsCapability;
  terminalSessions: TerminalSessionsCapability;
  alert(message: string): void;
}

export async function createWorkspaceEnvironmentCapability(
  dependencies: WorkspaceEnvironmentDependencies,
): Promise<WorkspaceEnvironmentCapability> {
  const listeners = new Set<() => void>();
  const local = { kind: "local" } as const;
  let home: string | null = null;
  let launchCwd: string | null = null;
  try {
    home = normalizePath(await Promise.resolve(dependencies.workspace.homeDir()));
  } catch {
    home = null;
  }
  if (home !== null) {
    try {
      await Promise.resolve(dependencies.workspace.authorize(home, local));
    } catch {
      // Home resolution succeeded; bootstrap authorization is non-fatal.
    }
  }
  try {
    launchCwd = await Promise.resolve(dependencies.workspace.currentDir());
  } catch {
    launchCwd = null;
  }
  let snapshot: WorkspaceEnvironmentSnapshot = {
    workspace: local,
    home,
    launchCwd,
    launchCwdResolved: true,
    wslDistros: [],
    wslLoading: false,
    wslError: null,
  };
  let transitionSequence = 0;
  const publish = (next: Partial<WorkspaceEnvironmentSnapshot>) => {
    snapshot = { ...snapshot, ...next };
    for (const listener of listeners) listener();
  };
  const resolveHome = async (workspace: SelectedWorkspaceEnvironment) => {
    if (workspace.kind === "wsl") {
      return Promise.resolve(dependencies.workspace.wslHome(workspace.distro));
    }
    if (workspace.kind === "ssh") {
      if (dependencies.execution) {
        return dependencies.execution.invoke<string>(workspace, {
          domain: "ssh",
          method: "resolveHome",
          args: [],
        });
      }
      if (dependencies.ssh) return dependencies.ssh.resolveHome(workspace);
      throw new Error("SSH workspace execution is unavailable");
    }
    return normalizePath(
      await Promise.resolve(dependencies.workspace.homeDir()),
    );
  };

  return {
    snapshot: () => snapshot,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    async switch(workspace) {
      if (scopeKey(workspace) === scopeKey(snapshot.workspace)) return false;
      const sequence = ++transitionSequence;
      const dirty = dependencies.tabs
        .snapshot()
        .tabs.some(
          (tab) => tab.kind === "editor" && tab.data?.dirty === true,
        );
      if (dirty) {
        dependencies.alert(
          "Save or close unsaved editor tabs before switching workspace.",
        );
        return false;
      }
      let nextHome: string;
      try {
        nextHome = await resolveHome(workspace);
      } catch (error) {
        dependencies.alert(String(error));
        return false;
      }
      if (sequence !== transitionSequence) return false;
      publish({ workspace, home: nextHome, launchCwd: nextHome });
      await Promise.resolve(dependencies.workspace.authorize(nextHome, workspace));
      const activeRigId = dependencies.rigs.snapshot().activeId;
      dependencies.terminalSessions.reset({
        cwd: nextHome,
        ...(activeRigId ? { rigId: activeRigId } : {}),
      });
      if (activeRigId) {
        dependencies.rigs.setWorkspace(activeRigId, workspace, nextHome);
      }
      return true;
    },
    async adopt(workspace) {
      const sequence = ++transitionSequence;
      publish({ workspace });
      let nextHome: string;
      try {
        nextHome = await resolveHome(workspace);
      } catch {
        return null;
      }
      if (sequence !== transitionSequence) return null;
      await Promise.resolve(dependencies.workspace.authorize(nextHome, workspace));
      publish({ home: nextHome, launchCwd: nextHome });
      return nextHome;
    },
    async refreshWslDistros() {
      publish({ wslLoading: true, wslError: null });
      try {
        const wslDistros = await Promise.resolve(
          dependencies.workspace.listWslDistros(),
        );
        publish({ wslDistros, wslLoading: false });
        return wslDistros;
      } catch (error) {
        publish({
          wslDistros: [],
          wslLoading: false,
          wslError: String(error),
        });
        return [];
      }
    },
  };
}

function normalizePath(path: string): string {
  return path.replace(/\\/g, "/");
}

function scopeKey(workspace: SelectedWorkspaceEnvironment): string {
  if (workspace.kind === "wsl") return `wsl:${workspace.distro}`;
  if (workspace.kind === "ssh") return `ssh:${workspace.connectionId}`;
  return "local";
}
