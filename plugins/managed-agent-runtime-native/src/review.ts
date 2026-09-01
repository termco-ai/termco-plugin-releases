import type { AiSessionsCapability } from "@termco/ai-sessions-base";
import type { ManagedAgent } from "./store";
import { ManagedAgentStore } from "./store";

function reviewDirective(agent: ManagedAgent): string {
  const remaining = agent.maxRounds - agent.rounds;
  const lastRound =
    remaining <= 1
      ? " This is the last automatic review round, so make any follow-up count."
      : "";
  return `The Claude Code agent you are supervising has finished its turn on:\n\n> ${agent.task}\n\nCall read_agent_output to see what it actually did and reported. Then decide: if the task is complete, confirm it is done (do not call send_to_agent); otherwise call send_to_agent with one precise follow-up.${lastRound}`;
}

function canReview(agent: ManagedAgent): boolean {
  return (
    agent.phase !== "done" &&
    agent.rounds < agent.maxRounds &&
    agent.reviewedAtRound < agent.rounds
  );
}

/** Coordinates bounded follow-up reviews through the selected AI sessions. */
export class ManagedAgentReviewController {
  constructor(
    private readonly store: ManagedAgentStore,
    private readonly sessions: AiSessionsCapability,
  ) {}

  finished(leafId: number): void {
    const agent = this.store.get(leafId);
    if (!agent || !canReview(agent)) return;
    if (this.sessions.snapshot().activeSessionId !== agent.sessionId) {
      this.store.setPendingReview(leafId, true);
      return;
    }
    this.fire(agent);
  }

  activateSession(sessionId: string): void {
    const agent = this.store.getBySessionId(sessionId);
    if (!agent?.pendingReview) return;
    if (!canReview(agent)) {
      this.store.setPendingReview(agent.leafId, false);
      return;
    }
    this.fire(agent);
  }

  private fire(agent: ManagedAgent): void {
    this.store.markReviewed(agent.leafId);
    this.store.setPhase(agent.leafId, "reviewing");
    void this.sessions.sendMessage(agent.sessionId, reviewDirective(agent));
  }
}
