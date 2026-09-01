export type AgentActivityStatus = "working" | "waiting";
export type AgentActivitySource = "terminal" | "local";
export type AgentActivityNotificationKind = "attention" | "finished" | "error";

export interface AgentActivitySession {
  leafId: number;
  tabId: number;
  agent: string;
  status: AgentActivityStatus;
  startedAt: number;
  lastActivityAt: number;
  attentionSince: number | null;
}

export interface AgentActivityNotification {
  id: string;
  source: AgentActivitySource;
  leafId: number;
  tabId: number;
  agent: string;
  kind: AgentActivityNotificationKind;
  at: number;
  read: boolean;
}

export interface AgentActivitySnapshot {
  revision: number;
  sessions: readonly AgentActivitySession[];
  localAgent: { agent: string; status: AgentActivityStatus } | null;
  notifications: readonly AgentActivityNotification[];
}

export type AgentActivityEvent = {
  kind: "finished" | "exited";
  leafId: number;
};

export interface AgentActivityLocalState {
  agent: string;
  status: AgentActivityStatus;
  activate(): void;
}

export interface AgentActivityLocalNotification {
  agent: string;
  kind: AgentActivityNotificationKind;
  title: string;
  body?: string;
  visible: boolean;
  activate(): void;
}

export type AgentActivityTerminalSignal =
  | {
      kind: "started";
      leafId: number;
      tabId: number;
      agent: string;
    }
  | { kind: "working"; leafId: number }
  | {
      kind: "attention" | "finished";
      leafId: number;
      body?: string;
      visible: boolean;
      activate(): void;
    }
  | { kind: "exited"; leafId: number };

/** Shared terminal/local-agent activity and notification feed. The selected
 * provider owns signal subscriptions and lifecycle; shell plugins consume a
 * coherent public read model instead of importing its renderer store. */
export interface AgentActivityCapability {
  snapshot(): AgentActivitySnapshot;
  subscribe(listener: () => void): () => void;
  subscribeEvents(listener: (event: AgentActivityEvent) => void): () => void;
  nextAttentionTarget(): { tabId: number; leafId: number } | null;
  activateLocalAgent(): void;
  markAllRead(): void;
  clearNotifications(): void;
}

/** Narrow producer port for the plugin that owns the in-process local agent.
 * The activity provider remains the sole owner of the shared header snapshot,
 * notification feed, focus routing, and delivery policy. */
export interface AgentActivityControlCapability {
  terminalSignal(signal: AgentActivityTerminalSignal): void;
  setLocalAgent(state: AgentActivityLocalState | null): void;
  notifyLocal(notification: AgentActivityLocalNotification): void;
}

/** Optional reactions owned by other domains (for example managed-agent
 * review). The activity provider emits lifecycle facts without importing AI
 * stores. */
export interface AgentActivityEventContribution {
  id: string;
  finished?(leafId: number): void;
  exited?(leafId: number): void;
}

export interface AgentActivityEventRegistry {
  register(entry: AgentActivityEventContribution): Dispose;
  snapshot(): readonly AgentActivityEventContribution[];
  subscribe(listener: () => void): Dispose;
}
import type { Dispose } from "@termco/kernel";
