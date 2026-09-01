import { SessionId, type SessionHistoryCapability } from "@termco/session-base";
import { describe, expect, it, vi } from "vitest";
import { recoverSessionForContinuation } from "./recovery";

describe("trajectory recovery action", () => {
  it("asks the session owner to recover and then refreshes the current window", async () => {
    const order: string[] = [];
    const history = {
      loadForContinuation: vi.fn(async () => { order.push("owner-recovery"); }),
    } as unknown as SessionHistoryCapability;
    const refresh = vi.fn(async () => { order.push("refresh"); });

    await recoverSessionForContinuation(history, SessionId("session-1"), refresh);

    expect(history.loadForContinuation).toHaveBeenCalledWith(SessionId("session-1"));
    expect(order).toEqual(["owner-recovery", "refresh"]);
  });
});
