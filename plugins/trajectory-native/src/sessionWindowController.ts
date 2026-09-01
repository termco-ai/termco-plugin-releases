import type {
  ParsedSessionEvent,
  SessionCommit,
  SessionHeader,
  SessionHistoryCapability,
  SessionId,
  SessionRevision,
  SessionSeq,
  SessionWindow,
} from "@termco/session-base";

export interface SessionWindowControllerSnapshot {
  readonly header: SessionHeader | null;
  readonly events: readonly ParsedSessionEvent[];
  readonly revision: SessionRevision | null;
  readonly loading: boolean;
  readonly error: string | null;
  readonly hasEarlier: boolean;
  readonly hasLater: boolean;
  readonly repair: SessionWindow["repair"] | null;
}

export interface SessionWindowController {
  start(): Promise<void>;
  loadEarlier(): Promise<void>;
  loadAround(seq: SessionSeq): Promise<void>;
  refresh(): Promise<void>;
  snapshot(): SessionWindowControllerSnapshot;
  subscribe(listener: () => void): () => void;
  dispose(): void;
}

function mergeEvents(
  current: readonly ParsedSessionEvent[],
  incoming: readonly ParsedSessionEvent[],
): readonly ParsedSessionEvent[] {
  if (incoming.length === 0) return current;
  const bySeq = new Map<number, ParsedSessionEvent>();
  for (const event of current) bySeq.set(event.seq as number, event);
  for (const event of incoming) bySeq.set(event.seq as number, event);
  return Object.freeze([...bySeq.values()].sort((left, right) => left.seq - right.seq));
}

function repairAfterEvents(
  current: SessionWindow["repair"] | null,
  events: readonly ParsedSessionEvent[],
): SessionWindow["repair"] | null {
  if (current?.state === "corrupt") return current;
  let next = current;
  for (const event of events) {
    if (event.type === "turn/start" || event.type === "turn/resume") {
      next = { state: "open-tail" };
    } else if (event.type === "turn/suspend") {
      next = { state: "waiting-input" };
    } else if (event.type === "turn/end") {
      next = { state: "healthy" };
    }
  }
  return next;
}

export function createSessionWindowController(
  history: SessionHistoryCapability,
  sessionId: SessionId,
  options: { readonly pageSize?: number } = {},
): SessionWindowController {
  const pageSize = options.pageSize ?? 256;
  const listeners = new Set<() => void>();
  let disposeLive: (() => void) | null = null;
  let disposed = false;
  let started = false;
  let pending: SessionCommit[] = [];
  let queued: SessionCommit[] = [];
  let commitFlushScheduled = false;
  let cancelScheduledCommitFlush: (() => void) | null = null;
  let state: SessionWindowControllerSnapshot = Object.freeze({
    header: null,
    events: Object.freeze([]),
    revision: null,
    loading: true,
    error: null,
    hasEarlier: false,
    hasLater: false,
    repair: null,
  });

  const publish = (next: SessionWindowControllerSnapshot) => {
    if (disposed) return;
    state = Object.freeze(next);
    for (const listener of [...listeners]) listener();
  };

  const applyCommits = (commits: readonly SessionCommit[]) => {
    let revision = state.revision;
    let repair = state.repair;
    const incoming: ParsedSessionEvent[] = [];
    for (const commit of commits) {
      if (commit.sessionId !== sessionId) continue;
      if (revision !== null && commit.revision <= revision) continue;
      incoming.push(...commit.events);
      repair = repairAfterEvents(repair, commit.events);
      revision = commit.revision;
    }
    if (revision === state.revision) return;
    publish({
      ...state,
      events: mergeEvents(state.events, incoming),
      revision,
      hasLater: false,
      repair,
    });
  };

  const flushQueuedCommits = () => {
    commitFlushScheduled = false;
    cancelScheduledCommitFlush = null;
    if (disposed || queued.length === 0) return;
    const commits = queued;
    queued = [];
    applyCommits(commits);
  };

  const scheduleCommitFlush = () => {
    if (
      typeof window !== "undefined"
      && typeof document !== "undefined"
      && document.visibilityState === "visible"
      && typeof window.requestAnimationFrame === "function"
    ) {
      const frame = window.requestAnimationFrame(flushQueuedCommits);
      cancelScheduledCommitFlush = () => window.cancelAnimationFrame(frame);
      return;
    }
    const timeout = setTimeout(flushQueuedCommits, 0);
    cancelScheduledCommitFlush = () => clearTimeout(timeout);
  };

  const queueCommit = (commit: SessionCommit) => {
    if (commit.sessionId !== sessionId) return;
    queued.push(commit);
    if (commitFlushScheduled) return;
    commitFlushScheduled = true;
    scheduleCommitFlush();
  };

  return {
    async start() {
      if (started || disposed) return;
      started = true;
      disposeLive = history.subscribe(sessionId, (commit) => {
        if (state.header === null) pending.push(commit);
        else queueCommit(commit);
      });
      try {
        const window = await history.readWindow(sessionId, { kind: "tail", limit: pageSize });
        if (disposed) return;
        publish({
          header: window.header,
          events: Object.freeze([...window.events]),
          revision: window.revision,
          loading: false,
          error: null,
          hasEarlier: window.availability.earlier,
          hasLater: window.availability.later,
          repair: window.repair,
        });
        const buffered = pending;
        pending = [];
        applyCommits(buffered);
      } catch (error) {
        publish({ ...state, loading: false, error: String(error) });
      }
    },
    async loadEarlier() {
      if (disposed || state.loading || !state.hasEarlier) return;
      const first = state.events[0];
      if (!first || state.revision === null) return;
      try {
        const window = await history.readWindow(sessionId, {
          kind: "before",
          seq: first.seq,
          limit: pageSize,
        });
        if (disposed) return;
        publish({
          ...state,
          header: window.header,
          events: mergeEvents(state.events, window.events),
          hasEarlier: window.availability.earlier,
          repair: window.repair,
        });
      } catch (error) {
        publish({ ...state, error: String(error) });
      }
    },
    async loadAround(seq) {
      if (disposed || state.loading) return;
      if (state.events.some((event) => event.seq === seq)) return;
      try {
        const window = await history.readWindow(sessionId, {
          kind: "range",
          start: seq,
          end: seq,
        });
        if (disposed) return;
        publish({
          ...state,
          header: window.header,
          events: mergeEvents(state.events, window.events),
          repair: window.repair,
          error: null,
        });
      } catch (error) {
        publish({ ...state, error: String(error) });
      }
    },
    async refresh() {
      if (disposed || state.loading) return;
      try {
        const window = await history.readWindow(sessionId, { kind: "tail", limit: pageSize });
        if (disposed) return;
        publish({
          ...state,
          header: window.header,
          events: mergeEvents(state.events, window.events),
          revision: state.revision !== null && state.revision > window.revision
            ? state.revision
            : window.revision,
          hasEarlier: window.availability.earlier,
          hasLater: window.availability.later,
          repair: window.repair,
          error: null,
        });
      } catch (error) {
        publish({ ...state, error: String(error) });
      }
    },
    snapshot: () => state,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      pending = [];
      queued = [];
      cancelScheduledCommitFlush?.();
      cancelScheduledCommitFlush = null;
      commitFlushScheduled = false;
      listeners.clear();
      disposeLive?.();
      disposeLive = null;
    },
  };
}
