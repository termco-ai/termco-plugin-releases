import type {
  AgentActivityCapability,
  AgentHooksCapability,
} from "@termco/agents-base";
import type {
  AiLiveCapability,
  AiLiveContributionRegistry,
} from "@termco/ai-live-base";
import type { AiSessionsCapability } from "@termco/ai-sessions-base";
import type { TerminalSessionsCapability } from "@termco/terminal-base";
import { ManagedAgentReviewController } from "./review";
import { ManagedAgentStore } from "./store";

export interface ManagedAgentRuntimeDependencies {
  activity: AgentActivityCapability;
  hooks: AgentHooksCapability;
  sessions: AiSessionsCapability;
  terminals: TerminalSessionsCapability;
}

export type ManagedAgentRuntime = (() => void) & {
  bindLive(
    aiLive: AiLiveCapability,
    contributions: AiLiveContributionRegistry,
  ): () => void;
};

/** Install the source-owned managed-agent workflow. */
export function installManagedAgentRuntime(
  dependencies: ManagedAgentRuntimeDependencies,
): ManagedAgentRuntime {
  const store = new ManagedAgentStore();
  const review = new ManagedAgentReviewController(store, dependencies.sessions);
  let active = true;
  const timers = new Map<ReturnType<typeof setTimeout>, () => void>();
  const later = (run: () => void, delay: number): void => {
    const timer = setTimeout(() => {
      timers.delete(timer);
      if (active) run();
    }, delay);
    timers.set(timer, () => {});
  };
  const delay = (milliseconds: number) =>
    new Promise<boolean>((resolve) => {
      const timer = setTimeout(() => {
        timers.delete(timer);
        resolve(active);
      }, milliseconds);
      timers.set(timer, () => resolve(false));
    });

  const disposeEvents = dependencies.activity.subscribeEvents((event) => {
    if (event.kind === "finished") review.finished(event.leafId);
    else store.remove(event.leafId);
  });
  const disposeSessions = dependencies.sessions.subscribe(() => {
    const sessionId = dependencies.sessions.snapshot().activeSessionId;
    if (sessionId) review.activateSession(sessionId);
  });
  const liveContribution = (
    aiLive: AiLiveCapability,
  ): Partial<AiLiveCapability> => ({
    spawnManagedAgent(prompt, sessionId) {
      const trimmed = prompt.trim();
      if (!trimmed) return null;
      const rigId = dependencies.sessions.sessionContext(sessionId)?.rigId;
      const cwd = aiLive.getCwd(rigId);
      const oneLine = trimmed.replace(/\s*\r?\n\s*/g, " ");
      const short =
        oneLine.length > 32 ? `${oneLine.slice(0, 32)}…` : oneLine;
      const opened = dependencies.terminals.open({
        cwd: cwd ?? undefined,
        title: `claude · ${short}`,
      });
      store.register({ ...opened, sessionId, task: oneLine, cwd });
      void (async () => {
        await Promise.all([
          dependencies.terminals.whenReady(opened.leafId),
          Promise.resolve()
            .then(() => dependencies.hooks.enable("claude"))
            .catch(() => {}),
        ]);
        if (!active) return;
        if (!dependencies.terminals.write(opened.leafId, "claude\r")) return;
        const started = Date.now();
        while (active && Date.now() - started < 8_000) {
          const buffer = dependencies.terminals.buffer(opened.leafId, 120);
          if (buffer === null) break;
          if (buffer.includes("shortcuts") || buffer.includes("? for")) {
            dependencies.terminals.write(
              opened.leafId,
              `\x1b[200~${trimmed}\x1b[201~`,
            );
            later(
              () => dependencies.terminals.write(opened.leafId, "\r"),
              120,
            );
            store.setPhase(opened.leafId, "working");
            return;
          }
          if (!(await delay(120))) return;
        }
        if (active) store.remove(opened.leafId);
      })();
      return opened;
    },
    getManagedAgent(sessionId) {
      const agent = store.getBySessionId(sessionId);
      return agent
        ? {
            leafId: agent.leafId,
            tabId: agent.tabId,
            phase: agent.phase,
            rounds: agent.rounds,
            maxRounds: agent.maxRounds,
          }
        : null;
    },
    async sendManagedAgentInstruction(sessionId, instruction) {
      const agent = store.getBySessionId(sessionId);
      if (!agent) return { ok: false, error: "no managed agent is active" };
      if (agent.rounds >= agent.maxRounds) {
        return { ok: false, error: "the managed agent reached its review limit" };
      }
      const written = dependencies.terminals.write(
        agent.leafId,
        `\x1b[200~${instruction}\x1b[201~`,
      );
      if (!written) return { ok: false, error: "managed agent input is unavailable" };
      later(() => dependencies.terminals.write(agent.leafId, "\r"), 120);
      store.bumpRound(agent.leafId);
      return { ok: true, round: agent.rounds };
    },
    readManagedAgentOutput(sessionId) {
      const agent = store.getBySessionId(sessionId);
      return agent ? dependencies.terminals.buffer(agent.leafId, 400) : null;
    },
  });

  let disposeLive = () => {};
  const dispose = (() => {
    active = false;
    for (const [timer, cancel] of timers) {
      clearTimeout(timer);
      cancel();
    }
    timers.clear();
    disposeLive();
    disposeSessions();
    disposeEvents();
    store.clear();
  }) as ManagedAgentRuntime;
  dispose.bindLive = (aiLive, contributions) => {
    disposeLive();
    const selected = contributions.register(liveContribution(aiLive));
    disposeLive = selected;
    let disposed = false;
    return () => {
      if (disposed || disposeLive !== selected) return;
      disposed = true;
      selected();
      disposeLive = () => {};
    };
  };
  return dispose;
}
