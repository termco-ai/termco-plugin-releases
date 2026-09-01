import ui from "@termco/ui";
import type {
  WorkspaceTabRecord,
  WorkspaceTabsCapability,
} from "@termco/workspace-base";

const { useSyncExternalStore } = ui.React;

function dirname(path: string): string {
  const normalized = path.replace(/\\/g, "/");
  const index = normalized.lastIndexOf("/");
  return index <= 0 ? normalized : normalized.slice(0, index);
}

type PaneNode = {
  kind?: unknown;
  id?: unknown;
  cwd?: unknown;
  children?: unknown;
  first?: unknown;
  second?: unknown;
};

function paneCwd(node: unknown, activeLeafId: unknown): string | null {
  if (!node || typeof node !== "object") return null;
  const pane = node as PaneNode;
  if (pane.kind === "leaf") {
    return pane.id === activeLeafId && typeof pane.cwd === "string"
      ? pane.cwd
      : null;
  }
  if (Array.isArray(pane.children)) {
    for (const child of pane.children) {
      const cwd = paneCwd(child, activeLeafId);
      if (cwd) return cwd;
    }
    return null;
  }
  return (
    paneCwd(pane.first, activeLeafId) ?? paneCwd(pane.second, activeLeafId)
  );
}

export function sourceControlContextPath(
  tab: WorkspaceTabRecord | undefined,
  rootPath: string | null,
): string | null {
  const data = tab?.data ?? {};
  if (tab?.kind === "terminal") {
    return paneCwd(data.paneTree, data.activeLeafId) ?? rootPath;
  }
  if (
    (tab?.kind === "editor" || tab?.kind === "markdown") &&
    typeof data.path === "string"
  ) {
    return dirname(data.path);
  }
  if (
    (tab?.kind === "git-diff" ||
      tab?.kind === "git-commit-file" ||
      tab?.kind === "git-history") &&
    typeof data.repoRoot === "string"
  ) {
    return data.repoRoot;
  }
  return rootPath;
}

export function useSourceControlContextPath(
  tabs: WorkspaceTabsCapability,
  rootPath: string | null,
): string | null {
  const snapshot = useSyncExternalStore(
    (listener) => tabs.subscribe(listener),
    () => tabs.snapshot(),
    () => tabs.snapshot(),
  );
  return sourceControlContextPath(
    snapshot.tabs.find((tab) => tab.id === snapshot.activeId),
    rootPath,
  );
}
