import type { Chat, UIMessage } from "@ai-sdk/react";
import { useChatStore } from "./store";

const CHATS_LRU_CAP = 8;

/** Live message runtimes belong to the selected application-wide chat
 * provider. Consumers may render or command them, but must never create a
 * second registry with a different active session or eviction policy. */
export const chats = new Map<string, Chat<UIMessage>>();

export function touchChat(id: string, chat: Chat<UIMessage>): void {
  if (chats.has(id)) chats.delete(id);
  chats.set(id, chat);
  while (chats.size > CHATS_LRU_CAP) {
    const oldest = chats.keys().next().value;
    if (!oldest || oldest === id) break;
    if (useChatStore.getState().activeSessionId === oldest) break;
    const chat = chats.get(oldest);
    const stopping = chat?.stop();
    chats.delete(oldest);
    void import("../chatRuntime").then(({ finishOwnedChatStop }) =>
      finishOwnedChatStop(oldest, stopping)
    );
  }
}

/** Tool definitions used to preserve tool calls while compacting a session. */
export const toolContexts = new Map<string, unknown>();

/** One-shot transcript handoff consumed when a live Chat is constructed. */
export const seedMessages = new Map<string, UIMessage[]>();

export const aiSessionsRegistry = {
  chats,
  seedMessages,
  toolContexts,
  touchChat,
};
