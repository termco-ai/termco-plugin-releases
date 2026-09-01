import { describe, expect, it } from "vitest";
import { DEFAULT_MAX_ROUNDS, ManagedAgentStore } from "./store";

describe("managed agent runtime store", () => {
  it("owns phase, round, review, lookup, and removal state", () => {
    const store = new ManagedAgentStore();
    store.register({
      leafId: 7,
      tabId: 3,
      sessionId: "session-a",
      task: "Implement it",
      cwd: "/work",
    });
    expect(store.getBySessionId("session-a")).toMatchObject({
      leafId: 7,
      phase: "spawning",
      rounds: 0,
      maxRounds: 3,
    });
    store.bumpRound(7);
    store.setPendingReview(7, true);
    store.markReviewed(7);
    expect(store.get(7)).toMatchObject({
      phase: "working",
      rounds: 1,
      reviewedAtRound: 1,
      pendingReview: false,
    });
    store.remove(7);
    expect(store.get(7)).toBeUndefined();
  });

  it("preserves registration defaults and explicit round budgets", () => {
    const store = new ManagedAgentStore();
    expect(
      store.register({
        leafId: 1,
        tabId: 10,
        sessionId: "s1",
        task: "do things",
        cwd: "/repo",
      }),
    ).toEqual({
      leafId: 1,
      tabId: 10,
      sessionId: "s1",
      task: "do things",
      cwd: "/repo",
      rounds: 0,
      maxRounds: DEFAULT_MAX_ROUNDS,
      phase: "spawning",
      reviewedAtRound: -1,
      pendingReview: false,
    });
    expect(
      store.register({
        leafId: 2,
        tabId: 11,
        sessionId: "s2",
        task: "do more",
        cwd: null,
        maxRounds: 7,
      }).maxRounds,
    ).toBe(7);
    expect(store.getBySessionId("s2")?.leafId).toBe(2);
    expect(store.getBySessionId("missing")).toBeUndefined();
  });

  it("ignores unknown leaves and clears all private runtime state", () => {
    const store = new ManagedAgentStore();
    store.setPhase(99, "done");
    store.bumpRound(99);
    store.markReviewed(99);
    store.setPendingReview(99, true);
    store.remove(99);
    store.register({
      leafId: 1,
      tabId: 1,
      sessionId: "s1",
      task: "task",
      cwd: null,
    });
    store.clear();
    expect(store.get(1)).toBeUndefined();
  });
});
