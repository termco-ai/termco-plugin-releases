/** Historical UI command surface backed by ai-chat-native's one Chat registry. */
import type { Chat, UIMessage } from "@ai-sdk/react";
import { getOrCreateOwnedChat } from "../../../chatRuntime";
import { hasKeyForModel, useChatStore } from "../chatStore";
import { sendChatMessage } from "./send";

export function getOrCreateChat(sessionId: string): Chat<UIMessage> {
  return getOrCreateOwnedChat(sessionId);
}

function activeChat(): Chat<UIMessage> | null {
  const sessionId = useChatStore.getState().activeSessionId;
  return sessionId ? getOrCreateChat(sessionId) : null;
}

export async function sendMessage(text: string): Promise<boolean> {
  const trimmed = text.trim();
  if (!trimmed) return false;
  return (await sendChatMessage({ parts: [{ type: "text", text: trimmed }] })).ok;
}

export async function regenerateMessage(messageId: string): Promise<void> {
  const state = useChatStore.getState();
  if (!hasKeyForModel(state.selectedModelId)) return;
  await activeChat()?.regenerate({ messageId });
}

export async function editUserMessage(
  messageId: string,
  text: string,
): Promise<boolean> {
  const trimmed = text.trim();
  if (!trimmed) return false;
  return (
    await sendChatMessage({
      parts: [{ type: "text", text: trimmed }],
      messageId,
    })
  ).ok;
}

export function rewindTo(messageId: string): void {
  const chat = activeChat();
  if (!chat) return;
  const index = chat.messages.findIndex((message) => message.id === messageId);
  if (index >= 0) chat.messages = chat.messages.slice(0, index + 1);
}

export function deleteMessage(messageId: string): void {
  const chat = activeChat();
  if (chat) chat.messages = chat.messages.filter((message) => message.id !== messageId);
}
