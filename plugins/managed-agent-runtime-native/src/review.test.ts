import { describe, expect, it, vi } from "vitest";
import type { AiSessionsCapability } from "@termco/ai-sessions-base";
import { ManagedAgentReviewController } from "./review";
import { ManagedAgentStore } from "./store";

describe("managed agent runtime review", () => {
  it("defers for another session and fires when that session activates", () => {
    const store = new ManagedAgentStore();
    store.register({
      leafId: 7,
      tabId: 3,
      sessionId: "session-a",
      task: "Implement it",
      cwd: "/work",
    });
    const sendMessage = vi.fn(async (_sessionId: string, _message: string) => {});
    let activeSessionId: string | null = "session-b";
    const sessions = {
      snapshot: () => ({ activeSessionId }),
      sendMessage,
    } as unknown as AiSessionsCapability;
    const review = new ManagedAgentReviewController(store, sessions);

    review.finished(7);
    expect(store.get(7)?.pendingReview).toBe(true);
    expect(sendMessage).not.toHaveBeenCalled();

    activeSessionId = "session-a";
    review.activateSession("session-a");
    expect(store.get(7)).toMatchObject({
      phase: "reviewing",
      pendingReview: false,
      reviewedAtRound: 0,
    });
    expect(sendMessage).toHaveBeenCalledWith(
      "session-a",
      expect.stringContaining("Call read_agent_output"),
    );
  });

  it("fires an active review once and includes last-round guidance", () => {
    const store = new ManagedAgentStore();
    const agent = store.register({
      leafId: 7,
      tabId: 3,
      sessionId: "session-a",
      task: "build the feature",
      cwd: null,
      maxRounds: 3,
    });
    store.bumpRound(7);
    store.bumpRound(7);
    const sendMessage = vi.fn(async (_sessionId: string, _message: string) => {});
    const sessions = {
      snapshot: () => ({ activeSessionId: "session-a" }),
      sendMessage,
    } as unknown as AiSessionsCapability;
    const review = new ManagedAgentReviewController(store, sessions);

    review.finished(7);
    expect(sendMessage).toHaveBeenCalledWith(
      "session-a",
      expect.stringContaining("build the feature"),
    );
    expect(sendMessage.mock.calls[0]?.[1]).toContain("read_agent_output");
    expect(sendMessage.mock.calls[0]?.[1]).toContain(
      "last automatic review round",
    );
    expect(agent).toMatchObject({
      phase: "reviewing",
      reviewedAtRound: 2,
      pendingReview: false,
    });
    review.finished(7);
    expect(sendMessage).toHaveBeenCalledTimes(1);
  });

  it("rejects unmanaged, done, and over-budget reviews", () => {
    const store = new ManagedAgentStore();
    const sendMessage = vi.fn(async (_sessionId: string, _message: string) => {});
    const sessions = {
      snapshot: () => ({ activeSessionId: "session-a" }),
      sendMessage,
    } as unknown as AiSessionsCapability;
    const review = new ManagedAgentReviewController(store, sessions);
    review.finished(99);

    const done = store.register({
      leafId: 1,
      tabId: 1,
      sessionId: "session-a",
      task: "done",
      cwd: null,
    });
    done.phase = "done";
    review.finished(1);

    const exhausted = store.register({
      leafId: 2,
      tabId: 2,
      sessionId: "session-a",
      task: "exhausted",
      cwd: null,
      maxRounds: 1,
    });
    exhausted.rounds = 1;
    review.finished(2);
    expect(sendMessage).not.toHaveBeenCalled();
  });

  it("clears a deferred review that is no longer allowed", () => {
    const store = new ManagedAgentStore();
    const agent = store.register({
      leafId: 7,
      tabId: 3,
      sessionId: "session-a",
      task: "task",
      cwd: null,
      maxRounds: 1,
    });
    agent.pendingReview = true;
    agent.rounds = 1;
    const sendMessage = vi.fn(async (_sessionId: string, _message: string) => {});
    const sessions = {
      snapshot: () => ({ activeSessionId: "session-a" }),
      sendMessage,
    } as unknown as AiSessionsCapability;
    const review = new ManagedAgentReviewController(store, sessions);
    review.activateSession("session-a");
    expect(agent.pendingReview).toBe(false);
    expect(sendMessage).not.toHaveBeenCalled();
  });
});
