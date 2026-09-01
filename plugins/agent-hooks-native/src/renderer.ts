import type { AgentActivityControlCapability } from "@termco/agents-base";
import type { ApplicationEventsCapability } from "@termco/events-base";
import {
  createProcessServiceProxy,
  processTransportService,
  type PluginModule,
  type ProcessTransport,
  type Services,
} from "@termco/kernel";
import type { TerminalSessionsCapability } from "@termco/terminal-base";
import type {
  WorkspaceTabRecord,
  WorkspaceTabsCapability,
} from "@termco/workspace-base";
import { AGENTS_ACTIVITY_CONTROL_SERVICE } from "@termco/agents-base";
import { AGENTS_TERMINAL_HOOKS_SERVICE } from "@termco/agents-base";
import { EVENTS_APPLICATION_SERVICE } from "@termco/events-base";
import { TERMINAL_SESSIONS_SERVICE } from "@termco/terminal-base";
import { WORKSPACE_TABS_SERVICE } from "@termco/workspace-base";

type AgentSignal = {
  id: number;
  kind: "started" | "working" | "attention" | "finished" | "exited";
  agent: string | null;
};

function leafIds(node: unknown): number[] {
  if (!node || typeof node !== "object") return [];
  const value = node as { kind?: unknown; id?: unknown; children?: unknown };
  if (value.kind === "leaf" && Number.isSafeInteger(value.id)) {
    return [value.id as number];
  }
  if (value.kind !== "split" || !Array.isArray(value.children)) return [];
  return value.children.flatMap(leafIds);
}

function terminalTab(
  tabs: WorkspaceTabsCapability,
  leafId: number,
): WorkspaceTabRecord | null {
  return (
    tabs
      .snapshot()
      .tabs.find(
        (tab) =>
          tab.kind === "terminal" && leafIds(tab.data?.paneTree).includes(leafId),
      ) ?? null
  );
}

export function installTerminalActivity(input: {
  activity: AgentActivityControlCapability;
  events: ApplicationEventsCapability;
  tabs: WorkspaceTabsCapability;
  terminals: TerminalSessionsCapability;
}): () => void {
  return input.events.subscribe("termco:agent-signal", (payload) => {
    const signal = payload as AgentSignal;
    const leafId = input.terminals.leafForPty(signal.id);
    if (leafId === null) return;
    if (signal.kind === "started") {
      const tab = terminalTab(input.tabs, leafId);
      if (tab) {
        input.activity.terminalSignal({
          kind: "started",
          leafId,
          tabId: tab.id,
          agent: signal.agent ?? "agent",
        });
      }
      return;
    }
    if (signal.kind === "working" || signal.kind === "exited") {
      input.activity.terminalSignal({ kind: signal.kind, leafId });
      return;
    }
    const tab = terminalTab(input.tabs, leafId);
    input.activity.terminalSignal({
      kind: signal.kind,
      leafId,
      body: tab?.title,
      visible: input.tabs.snapshot().activeId === tab?.id,
      activate: () => {
        if (tab) input.tabs.transition({ activeId: tab.id });
        input.terminals.focus(leafId);
      },
    });
  });
}

const plugin: PluginModule = {
  inject: [
    AGENTS_ACTIVITY_CONTROL_SERVICE,
    EVENTS_APPLICATION_SERVICE,
    WORKSPACE_TABS_SERVICE,
    TERMINAL_SESSIONS_SERVICE,
    processTransportService,
  ],
  activate(context) {
    const transport = context.get<ProcessTransport>(processTransportService);
    context.provide(
      AGENTS_TERMINAL_HOOKS_SERVICE,
      createProcessServiceProxy<Services[typeof AGENTS_TERMINAL_HOOKS_SERVICE]>(
        AGENTS_TERMINAL_HOOKS_SERVICE,
        transport,
      ),
    );
    return installTerminalActivity({
      activity: context.get<AgentActivityControlCapability>(
        "agents.activity-control",
      ),
      events: context.get<ApplicationEventsCapability>(EVENTS_APPLICATION_SERVICE),
      tabs: context.get<WorkspaceTabsCapability>("workspace.tabs"),
      terminals: context.get<TerminalSessionsCapability>("terminal.sessions"),
    });
  },
};

export default plugin;
