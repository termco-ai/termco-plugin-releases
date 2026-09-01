import type { Chat, UIMessage } from "@ai-sdk/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const harness = vi.hoisted(() => ({
  getOrCreateChat: vi.fn(),
  shouldCompactBeforeSend: vi.fn(() => true),
  runCompaction: vi.fn(async () => ({ ok: true as const, sessionId: "s2" })),
  refreshCompactionPolicy: vi.fn(async () => undefined),
  declineAutomaticCompaction: vi.fn(async () => undefined),
  patchSession: vi.fn(),
  patchAgentMeta: vi.fn(),
  state: {
    activeSessionId: "s1" as string | null,
    selectedModelId: "model",
  },
}));

vi.mock("../chatStore", () => ({
  hasKeyForModel: () => true,
  useChatStore: {
    getState: () => ({
      ...harness.state,
      patchSession: harness.patchSession,
      patchAgentMeta: harness.patchAgentMeta,
    }),
  },
}));
vi.mock("./index", () => ({ getOrCreateChat: harness.getOrCreateChat }));
vi.mock("./compaction", () => ({
  declineAutomaticCompaction: harness.declineAutomaticCompaction,
  refreshCompactionPolicy: harness.refreshCompactionPolicy,
  shouldCompactBeforeSend: harness.shouldCompactBeforeSend,
  runCompaction: harness.runCompaction,
}));

import { noteStreamError, resetOverflowNotes } from "./overflow";
import { MAX_OVERFLOW_RETRIES, sendChatMessage } from "./send";

type FakeChat = {
  id: string;
  error: unknown;
  status: string;
  sendMessage: ReturnType<typeof vi.fn>;
};

const chats = new Map<string, FakeChat>();

function makeChat(id: string, error: unknown = null): FakeChat {
  const chat = {
    id,
    error,
    status: "ready",
    sendMessage: vi.fn(async () => {}),
  };
  chats.set(id, chat);
  return chat;
}

const TOO_LONG = Object.assign(
  new Error("prompt is too long: 214321 tokens > 200000 maximum"),
  { statusCode: 400 },
);

beforeEach(() => {
  vi.clearAllMocks();
  chats.clear();
  resetOverflowNotes();
  harness.state.activeSessionId = "s1";
  harness.shouldCompactBeforeSend.mockReturnValue(true);
  harness.runCompaction.mockResolvedValue({ ok: true, sessionId: "s2" });
  harness.getOrCreateChat.mockImplementation((sessionId: string) =>
    (chats.get(sessionId) ?? makeChat(sessionId)) as unknown as Chat<UIMessage>
  );
});

describe("sendChatMessage compaction gate", () => {
  it("sends a new turn into the compacted successor session", async () => {
    const target = makeChat("s2");
    await expect(
      sendChatMessage({
        sessionId: "s1",
        parts: [{ type: "text", text: "continue" }],
      }),
    ).resolves.toEqual({ ok: true, sessionId: "s2", compacted: true });
    expect(harness.runCompaction).toHaveBeenCalledWith({
      sessionId: "s1",
      mode: "proactive",
      silent: true,
    });
    expect(harness.getOrCreateChat).toHaveBeenLastCalledWith("s2");
    expect(target.sendMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        role: "user",
        parts: [{ type: "text", text: "continue" }],
      }),
    );
  });

  it("does not compact an edit because its message id belongs to the source", async () => {
    await sendChatMessage({
      sessionId: "s1",
      messageId: "u1",
      parts: [{ type: "text", text: "edited" }],
    });
    expect(harness.shouldCompactBeforeSend).not.toHaveBeenCalled();
    expect(harness.getOrCreateChat).toHaveBeenLastCalledWith("s1");
  });

  it("records a cancelled proactive attempt as the user's decision", async () => {
    harness.runCompaction.mockResolvedValueOnce({
      ok: false,
      reason: "cancelled",
    } as never);
    await sendChatMessage({
      sessionId: "s1",
      parts: [{ type: "text", text: "send anyway" }],
    });
    expect(harness.declineAutomaticCompaction).toHaveBeenCalledWith("s1");
    expect(harness.getOrCreateChat).toHaveBeenLastCalledWith("s1");
  });
});

describe("reactive overflow recovery", () => {
  beforeEach(() => {
    harness.shouldCompactBeforeSend.mockReturnValue(false);
  });

  it("compacts by the provider-reported gap and retries without duplicating the user message", async () => {
    const source = makeChat("s1");
    source.sendMessage.mockImplementationOnce(async () => {
      noteStreamError("s1", TOO_LONG, TOO_LONG);
    });
    const successor = makeChat("s2");

    await expect(
      sendChatMessage({
        sessionId: "s1",
        parts: [{ type: "text", text: "continue" }],
      }),
    ).resolves.toEqual({ ok: true, sessionId: "s2", compacted: true });

    expect(harness.runCompaction).toHaveBeenCalledWith(
      expect.objectContaining({
        sessionId: "s1",
        mode: "reactive",
        tokenGap: 14_321,
      }),
    );
    expect(successor.sendMessage).toHaveBeenCalledWith(undefined);
    expect(successor.sendMessage).not.toHaveBeenCalledWith(
      expect.objectContaining({ role: "user" }),
    );
  });

  it("does not mistake rate limiting for a context overflow", async () => {
    const rateLimited = Object.assign(
      new Error("Rate limit reached: 90000 tokens per min"),
      { statusCode: 429 },
    );
    makeChat("s1", rateLimited);

    await expect(
      sendChatMessage({
        sessionId: "s1",
        parts: [{ type: "text", text: "continue" }],
      }),
    ).resolves.toMatchObject({ ok: true, sessionId: "s1" });
    expect(harness.runCompaction).not.toHaveBeenCalled();
  });

  it("bounds repeated overflow retries", async () => {
    harness.getOrCreateChat.mockImplementation((sessionId: string) => {
      const chat = chats.get(sessionId) ?? makeChat(sessionId);
      chat.error = TOO_LONG;
      return chat as unknown as Chat<UIMessage>;
    });
    harness.runCompaction.mockResolvedValue({ ok: true, sessionId: "next" });

    await expect(
      sendChatMessage({
        sessionId: "s1",
        parts: [{ type: "text", text: "continue" }],
      }),
    ).resolves.toEqual({ ok: false, reason: "failed" });
    expect(harness.runCompaction.mock.calls.length).toBeLessThanOrEqual(
      MAX_OVERFLOW_RETRIES + 1,
    );
  });
});
