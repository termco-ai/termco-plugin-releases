import type { AiLiveCapability } from "@termco/ai-live-base";
import type { AiToolRuntime } from "@termco/ai-tools-base";
import type { WorkspaceRigsCapability } from "@termco/workspace-base";

/** Build a tool runtime pinned to the rig named by an external MCP request.
 * Every rig-sensitive operation carries that id instead of consulting the
 * foreground rig. */
export function createRigToolRuntime(
  rigId: string,
  live: AiLiveCapability,
  rigs: WorkspaceRigsCapability,
): AiToolRuntime {
  const rig = () => rigs.snapshot().rigs.find((entry) => entry.id === rigId);
  return {
    getCwd: () => live.getCwd(rigId),
    getWorkspaceRoot: () => live.getWorkspaceRoot(),
    getWorkspaceEnv: () => rig()?.workspace ?? { kind: "local" },
    getRigRoot: () => rig()?.root ?? null,
    getTerminalContext: () => live.getTerminalContext(rigId),
    isActiveTerminalPrivate: () => live.isActiveTerminalPrivate(rigId),
    injectIntoActivePty: (text) => live.injectIntoActivePty(text, rigId),
    runInTerminal: (command) => live.runInActiveTerminal(command, rigId),
    getActiveViewKind: () => {
      const tabs = live.listTabs(rigId);
      return (tabs.find((tab) => tab.active) ?? tabs[0])?.kind ?? null;
    },
    setWorkspaceFolder: (cwd) => live.setAgentCwd(cwd),
    openPreview: (url) => live.openPreview(url),
    getBrowserTabId: () => live.getBrowserTabId(rigId),
    openBrowser: (url) => live.openBrowser(url, rigId),
    listBrowserTabs: () => live.listBrowserTabs(rigId),
    switchBrowserTab: (id) => live.switchBrowserTab(id),
    closeBrowserTab: (id) => live.closeBrowserTab(id),
    listTabs: () => live.listTabs(rigId),
    focusView: (target) => live.focusView(target, rigId),
    modelSupportsVision: () => true,
    readCache: new Map(),
    getSessionId: () => null,
  };
}
