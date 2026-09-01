import type {
  AgentActivityCapability,
  AgentActivityEvent,
  AgentActivityLocalState,
  AgentActivityNotification,
  AgentActivitySession,
  AgentActivitySnapshot,
  AgentActivityStatus,
} from "@termco/agents-base";

const MAX_NOTIFICATIONS = 50;

export class AgentActivityStore implements AgentActivityCapability {
  readonly #listeners = new Set<() => void>();
  readonly #eventListeners = new Set<(event: AgentActivityEvent) => void>();
  readonly #sessions = new Map<number, AgentActivitySession>();
  #localAgent: AgentActivitySnapshot["localAgent"] = null;
  #notifications: AgentActivityNotification[] = [];
  #revision = 0;
  #notificationSequence = 0;
  #activateLocalAgent: (() => void) | null = null;
  #snapshot: AgentActivitySnapshot = {
    revision: 0,
    sessions: [],
    localAgent: null,
    notifications: [],
  };

  snapshot = (): AgentActivitySnapshot => this.#snapshot;

  subscribe = (listener: () => void): (() => void) => {
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  };

  subscribeEvents = (
    listener: (event: AgentActivityEvent) => void,
  ): (() => void) => {
    this.#eventListeners.add(listener);
    return () => this.#eventListeners.delete(listener);
  };

  nextAttentionTarget = (): { tabId: number; leafId: number } | null => {
    const target = [...this.#sessions.values()]
      .filter((session) => session.status === "waiting")
      .sort(
        (left, right) =>
          (right.attentionSince ?? 0) - (left.attentionSince ?? 0),
      )[0];
    return target ? { tabId: target.tabId, leafId: target.leafId } : null;
  };

  activateLocalAgent = (): void => {
    this.#activateLocalAgent?.();
  };

  setLocalAgent = (state: AgentActivityLocalState | null): void => {
    this.#activateLocalAgent = state?.activate ?? null;
    const next = state ? { agent: state.agent, status: state.status } : null;
    if (
      this.#localAgent === next ||
      (this.#localAgent &&
        next &&
        this.#localAgent.agent === next.agent &&
        this.#localAgent.status === next.status)
    ) {
      return;
    }
    this.#localAgent = next;
    this.#publish();
  };

  markAllRead = (): void => {
    if (!this.#notifications.some((notification) => !notification.read)) return;
    this.#notifications = this.#notifications.map((notification) => ({
      ...notification,
      read: true,
    }));
    this.#publish();
  };

  clearNotifications = (): void => {
    if (this.#notifications.length === 0) return;
    this.#notifications = [];
    this.#publish();
  };

  start(leafId: number, tabId: number, agent: string): void {
    const now = Date.now();
    this.#sessions.set(leafId, {
      leafId,
      tabId,
      agent,
      status: "working",
      startedAt: now,
      lastActivityAt: now,
      attentionSince: null,
    });
    this.#publish();
  }

  setStatus(leafId: number, status: AgentActivityStatus): void {
    const previous = this.#sessions.get(leafId);
    if (!previous || previous.status === status) return;
    const now = Date.now();
    this.#sessions.set(leafId, {
      ...previous,
      status,
      lastActivityAt: now,
      attentionSince: status === "waiting" ? now : null,
    });
    this.#publish();
  }

  finish(leafId: number): void {
    if (!this.#sessions.delete(leafId)) return;
    this.#publish();
  }

  session(leafId: number): AgentActivitySession | null {
    return this.#sessions.get(leafId) ?? null;
  }

  pushNotification(
    notification: Omit<AgentActivityNotification, "id" | "at" | "read">,
  ): void {
    this.#notifications = [
      {
        ...notification,
        id: `n${++this.#notificationSequence}`,
        at: Date.now(),
        read: false,
      },
      ...this.#notifications,
    ].slice(0, MAX_NOTIFICATIONS);
    this.#publish();
  }

  emit(event: AgentActivityEvent): void {
    for (const listener of [...this.#eventListeners]) listener(event);
  }

  dispose(): void {
    this.#sessions.clear();
    this.#notifications = [];
    this.#localAgent = null;
    this.#activateLocalAgent = null;
    this.#publish();
    this.#listeners.clear();
    this.#eventListeners.clear();
  }

  #publish(): void {
    this.#snapshot = {
      revision: ++this.#revision,
      sessions: [...this.#sessions.values()],
      localAgent: this.#localAgent,
      notifications: this.#notifications,
    };
    for (const listener of [...this.#listeners]) listener();
  }
}
