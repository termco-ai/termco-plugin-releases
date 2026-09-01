import type {
  UiHeaderAgentNotification,
  UiHeaderAgentSession,
  UiHeaderBulkCloseMode,
  UiHeaderFindTarget,
  UiHeaderRig,
  UiHeaderRuntime,
  UiHeaderTab,
} from "@termco/ui-header-base";

export type Tab = UiHeaderTab;
export type EditorTab = UiHeaderTab & {
  kind: "editor";
  path?: string;
  overrideLanguage?: string | null;
};
export type TerminalTab = UiHeaderTab & {
  kind: "terminal";
};
export type BulkCloseMode = UiHeaderBulkCloseMode;
export type RigMeta = UiHeaderRig;
export type AgentSession = UiHeaderAgentSession;
export type AgentNotification = UiHeaderAgentNotification;
export type AgentStatus = UiHeaderAgentSession["status"];
export type SearchTarget = UiHeaderFindTarget | null;
export type HeaderRuntime = UiHeaderRuntime;

export type SearchInlineHandle = { focus(): void };

export function isPluginTab(tab: Tab): boolean {
  return tab.kind.startsWith("plugin:");
}

export function labelFor(tab: Tab): string {
  return tab.label;
}
