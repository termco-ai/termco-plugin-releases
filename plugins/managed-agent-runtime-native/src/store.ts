export const DEFAULT_MAX_ROUNDS = 3;

export type ManagedAgentPhase =
  | "spawning"
  | "working"
  | "reviewing"
  | "done";

export interface ManagedAgent {
  leafId: number;
  tabId: number;
  sessionId: string;
  task: string;
  cwd: string | null;
  rounds: number;
  maxRounds: number;
  phase: ManagedAgentPhase;
  reviewedAtRound: number;
  pendingReview: boolean;
}

export interface RegisterManagedAgent {
  leafId: number;
  tabId: number;
  sessionId: string;
  task: string;
  cwd: string | null;
  maxRounds?: number;
}

/** Runtime-plugin-private state. No host or UI store owns a mirror. */
export class ManagedAgentStore {
  readonly #agents = new Map<number, ManagedAgent>();

  register(input: RegisterManagedAgent): ManagedAgent {
    const agent: ManagedAgent = {
      ...input,
      maxRounds: input.maxRounds ?? DEFAULT_MAX_ROUNDS,
      rounds: 0,
      phase: "spawning",
      reviewedAtRound: -1,
      pendingReview: false,
    };
    this.#agents.set(agent.leafId, agent);
    return agent;
  }

  get(leafId: number): ManagedAgent | undefined {
    return this.#agents.get(leafId);
  }

  getBySessionId(sessionId: string): ManagedAgent | undefined {
    return [...this.#agents.values()].find(
      (agent) => agent.sessionId === sessionId,
    );
  }

  setPhase(leafId: number, phase: ManagedAgentPhase): void {
    const agent = this.#agents.get(leafId);
    if (agent) agent.phase = phase;
  }

  markReviewed(leafId: number): void {
    const agent = this.#agents.get(leafId);
    if (!agent) return;
    agent.reviewedAtRound = agent.rounds;
    agent.pendingReview = false;
  }

  setPendingReview(leafId: number, pending: boolean): void {
    const agent = this.#agents.get(leafId);
    if (agent) agent.pendingReview = pending;
  }

  bumpRound(leafId: number): void {
    const agent = this.#agents.get(leafId);
    if (!agent) return;
    agent.rounds += 1;
    agent.phase = "working";
  }

  remove(leafId: number): void {
    this.#agents.delete(leafId);
  }

  clear(): void {
    this.#agents.clear();
  }
}
