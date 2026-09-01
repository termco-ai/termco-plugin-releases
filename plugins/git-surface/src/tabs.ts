import type { UiTabDescriptor, UiTabsRuntime } from "@termco/ui-tabs-base";
import type {
  GitCommitFileDiffTab,
  GitDiffTab,
  GitHistoryTab,
  Tab,
} from "./tabTypes";

function text(
  data: Readonly<Record<string, unknown>> | undefined,
  key: string,
): string {
  const value = data?.[key];
  return typeof value === "string" ? value : "";
}

function optionalText(
  data: Readonly<Record<string, unknown>> | undefined,
  key: string,
): string | null {
  const value = data?.[key];
  return typeof value === "string" ? value : null;
}

export function toGitTab(
  tab: UiTabDescriptor,
  runtime: Pick<UiTabsRuntime, "workspaceForRig">,
): Tab | null {
  const workspace = runtime.workspaceForRig(tab.rigId);
  if (tab.kind === "git-diff") {
    const path = tab.path ?? text(tab.data, "path");
    const repoRoot = text(tab.data, "repoRoot");
    const mode = text(tab.data, "mode");
    if (!path || !repoRoot || (mode !== "+" && mode !== "-")) return null;
    return {
      id: tab.id,
      rigId: tab.rigId,
      kind: "git-diff",
      title: tab.title,
      cold: tab.cold,
      path,
      repoRoot,
      mode,
      originalPath: optionalText(tab.data, "originalPath"),
      workspace,
    } satisfies GitDiffTab;
  }
  if (tab.kind === "git-history") {
    const repoRoot = text(tab.data, "repoRoot");
    if (!repoRoot) return null;
    return {
      id: tab.id,
      rigId: tab.rigId,
      kind: "git-history",
      title: tab.title,
      cold: tab.cold,
      repoRoot,
      workspace,
    } satisfies GitHistoryTab;
  }
  if (tab.kind === "git-commit-file") {
    const repoRoot = text(tab.data, "repoRoot");
    const sha = text(tab.data, "sha");
    const path = tab.path ?? text(tab.data, "path");
    if (!repoRoot || !sha || !path) return null;
    return {
      id: tab.id,
      rigId: tab.rigId,
      kind: "git-commit-file",
      title: tab.title,
      cold: tab.cold,
      repoRoot,
      sha,
      shortSha: text(tab.data, "shortSha") || sha.slice(0, 7),
      subject: text(tab.data, "subject"),
      path,
      originalPath: optionalText(tab.data, "originalPath"),
      workspace,
    } satisfies GitCommitFileDiffTab;
  }
  return null;
}

export function toGitTabs(
  tabs: readonly UiTabDescriptor[],
  runtime: Pick<UiTabsRuntime, "workspaceForRig">,
): Tab[] {
  return tabs.flatMap((tab) => {
    if (tab.cold) return [];
    const mapped = toGitTab(tab, runtime);
    return mapped ? [mapped] : [];
  });
}
