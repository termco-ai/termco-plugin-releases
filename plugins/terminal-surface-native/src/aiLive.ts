import type { AiLiveCapability, AiLiveContributionCapability } from "@termco/ai-live-base";
import type { TerminalSessionsCapability } from "@termco/terminal-base";
import type { WorkspaceTabRecord, WorkspaceTabsCapability } from "@termco/workspace-base";
import { redactSensitive } from "./redactSensitive";

function activeTab(
  tabs: WorkspaceTabsCapability,
  rigId?: string,
): WorkspaceTabRecord | null {
  const snapshot = tabs.snapshot();
  const id = rigId ? snapshot.activeTabByRig[rigId] : snapshot.activeId;
  return snapshot.tabs.find((tab) => tab.id === id) ?? null;
}

export function contributeTerminalAiLive(
  contributions: AiLiveContributionCapability,
  aiLive: AiLiveCapability,
  tabs: WorkspaceTabsCapability,
  sessions: TerminalSessionsCapability,
): () => void {
  return contributions.contribute({
    getTerminalContext: (rigId) => {
      const tab = activeTab(tabs, rigId);
      const leafId = tab?.data?.activeLeafId;
      if (
        !tab ||
        tab.kind !== "terminal" ||
        tab.data?.private === true ||
        typeof leafId !== "number"
      ) {
        return null;
      }
      const buffer = sessions.buffer(leafId, 300);
      return buffer ? redactSensitive(buffer) : null;
    },
    isActiveTerminalPrivate: (rigId) => {
      const tab = activeTab(tabs, rigId);
      return tab?.kind === "terminal" && tab.data?.private === true;
    },
    injectIntoActivePty: (value, rigId) => {
      const tab = activeTab(tabs, rigId);
      const leafId = tab?.data?.activeLeafId;
      if (!tab || tab.kind !== "terminal" || typeof leafId !== "number") {
        return false;
      }
      const written = sessions.write(leafId, value);
      sessions.focus(leafId);
      return written;
    },
    runInActiveTerminal: async (command, rigId, settleMs = 500) => {
      const tab = activeTab(tabs, rigId);
      const leafId = tab?.data?.activeLeafId;
      if (!tab || tab.kind !== "terminal" || typeof leafId !== "number") {
        return { error: "no active terminal in this rig" };
      }
      if (tab.data?.private === true) {
        return { error: "active terminal is private" };
      }
      const before = sessions.buffer(leafId, 1000)?.length ?? 0;
      sessions.write(leafId, `${command.replace(/\r?\n/g, " ").trim()}\r`);
      sessions.focus(leafId);
      await new Promise((resolve) => setTimeout(resolve, settleMs));
      const after = sessions.buffer(leafId, 1000) ?? "";
      let output = after.length >= before ? after.slice(before) : after;
      const newline = output.indexOf("\n");
      if (newline >= 0) output = output.slice(newline + 1);
      return {
        output: redactSensitive(output.trim()).slice(-8000),
        cwd: aiLive.getCwd(rigId),
      };
    },
    readLeafBuffer: (leafId) => {
      const buffer = sessions.buffer(leafId, 300);
      return buffer ? redactSensitive(buffer) : null;
    },
  });
}
