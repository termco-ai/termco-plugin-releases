import type { Chat, UIMessage } from "@ai-sdk/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { chats, seedMessages, touchChat } from "./store/registry";
import { useChatStore } from "./store/store";

const fakeChat = () =>
  ({ stop: vi.fn(() => Promise.resolve()) }) as unknown as Chat<UIMessage>;

const initialState = useChatStore.getInitialState();

beforeEach(() => {
  useChatStore.setState(initialState, true);
  chats.clear();
  seedMessages.clear();
  vi.clearAllMocks();
});

describe("provider-owned live chat registry", () => {
  it("moves a reused chat to the most-recent position", () => {
    const a = fakeChat();
    const b = fakeChat();
    touchChat("a", a);
    touchChat("b", b);
    touchChat("a", a);
    expect(Array.from(chats.keys())).toEqual(["b", "a"]);
  });

  it("stops and evicts the oldest inactive chat past the cap", () => {
    const evicted = fakeChat();
    touchChat("c0", evicted);
    for (let i = 1; i <= 8; i += 1) touchChat(`c${i}`, fakeChat());
    expect(chats.size).toBe(8);
    expect(chats.has("c0")).toBe(false);
    expect(evicted.stop).toHaveBeenCalled();
  });

  it("never evicts the active session", () => {
    useChatStore.setState({ activeSessionId: "c0" });
    const active = fakeChat();
    touchChat("c0", active);
    for (let i = 1; i <= 8; i += 1) touchChat(`c${i}`, fakeChat());
    expect(chats.size).toBe(9);
    expect(chats.has("c0")).toBe(true);
    expect(active.stop).not.toHaveBeenCalled();
  });
});
