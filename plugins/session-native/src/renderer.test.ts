import {
  SessionId,
  SessionRevision,
  SessionSeq,
  type SessionCommit,
} from "@termco/session-base";
import type { ProcessTransport } from "@termco/kernel";
import { describe, expect, it, vi } from "vitest";
import { createRendererSessionHistory } from "./renderer";

describe("session history renderer bridge", () => {
  it("routes current retention policy through the process transport", async () => {
    const report = {
      protected: [],
      eligibleSessionIds: [SessionId("expired")],
      removedSessionIds: [SessionId("expired")],
    };
    const call = vi.fn(async () => report);
    const history = createRendererSessionHistory({
      call,
      registerChannel: vi.fn(),
      releaseChannel: vi.fn(),
      releaseRemote: vi.fn(async () => undefined),
    } as unknown as ProcessTransport);

    await expect(history.enforceRetention({ deleteUpdatedBefore: 100 }))
      .resolves.toEqual(report);
    expect(call).toHaveBeenCalledExactlyOnceWith(
      "session.history",
      "enforceRetention",
      [{ deleteUpdatedBefore: 100 }],
    );
  });

  it("routes current history methods through the process transport", async () => {
    const call = vi.fn(async () => ({ exhausted: true, sessions: [] }));
    const history = createRendererSessionHistory({
      call,
      registerChannel: vi.fn(),
      releaseChannel: vi.fn(),
      releaseRemote: vi.fn(async () => undefined),
    } as unknown as ProcessTransport);

    await expect(history.list({ limit: 7 })).resolves.toEqual({
      exhausted: true,
      sessions: [],
    });
    expect(call).toHaveBeenCalledExactlyOnceWith(
      "session.history",
      "list",
      [{ limit: 7 }],
    );
  });

  it("delivers committed batches and releases both local and remote subscription resources", async () => {
    let channelListener: (...messages: unknown[]) => void = () => {};
    const channel = { __termcoChannel: 41 };
    const remoteDispose = { __termcoDispose: "session-subscription-1" };
    const releaseChannel = vi.fn();
    const releaseRemote = vi.fn(async () => undefined);
    const call = vi.fn(async () => remoteDispose);
    const history = createRendererSessionHistory({
      call,
      registerChannel(listener) {
        channelListener = listener;
        return channel;
      },
      releaseChannel,
      releaseRemote,
    });
    const listener = vi.fn();
    const commit: SessionCommit = {
      sessionId: SessionId("session-a"),
      events: [{
        type: "session/title",
        seq: SessionSeq(0),
        time: 1,
        data: { title: "Current", source: "user" },
      }],
      revision: SessionRevision(1),
      tailSeq: SessionSeq(0),
      durability: "written",
    };

    const unsubscribe = history.subscribe(SessionId("session-a"), listener);
    channelListener(commit);
    expect(listener).toHaveBeenCalledExactlyOnceWith(commit);
    expect(call).toHaveBeenCalledExactlyOnceWith(
      "session.history",
      "subscribe",
      [SessionId("session-a"), channel],
    );

    unsubscribe();
    unsubscribe();
    await vi.waitFor(() => {
      expect(releaseChannel).toHaveBeenCalledExactlyOnceWith(channel);
      expect(releaseRemote).toHaveBeenCalledExactlyOnceWith(remoteDispose);
    });
  });
});
