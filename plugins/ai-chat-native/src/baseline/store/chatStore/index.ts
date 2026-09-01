/**
 * UI-facing adapter to the plugin-owned shared chat runtime. The restored
 * presentation imports its historical surface, while the state and live Chat
 * registry remain singletons owned by ai-chat-native.
 */
import type { Chat, UIMessage } from "@ai-sdk/react";
import {
  customEndpointId,
  isCustomEndpointModel,
  providerRequiresKey,
  resolveAvailableModel,
} from "../../../runtime";
import {
  chats,
  seedMessages,
  toolContexts,
  touchChat,
} from "../../../store/registry";
import { useChatStore } from "../../../store/store";

export { chats, seedMessages, toolContexts, touchChat, useChatStore };
export type {
  AgentMeta,
  AgentRunStatus,
  ApprovalResponder,
  MiniState,
  PendingSelection,
} from "../../../store/types";

export function getActiveProviderKey(): string | null {
  const { selectedModelId, apiKeys, customEndpointKeys } =
    useChatStore.getState();
  if (isCustomEndpointModel(selectedModelId)) {
    const endpointId = customEndpointId(selectedModelId);
    return endpointId ? customEndpointKeys[endpointId] ?? null : null;
  }
  const model = resolveAvailableModel(selectedModelId);
  return model ? apiKeys[model.provider] ?? null : null;
}

export function hasKeyForModel(modelId: string): boolean {
  if (isCustomEndpointModel(modelId)) return true;
  const provider = resolveAvailableModel(modelId)?.provider;
  if (!provider) return false;
  return providerRequiresKey(provider)
    ? Boolean(useChatStore.getState().apiKeys[provider])
    : true;
}

export function getChat(sessionId?: string): Chat<UIMessage> | undefined {
  const id = sessionId ?? useChatStore.getState().activeSessionId;
  return id ? chats.get(id) : undefined;
}

export function getAgentMeta() {
  return useChatStore.getState().agentMeta;
}

export function stop(): void {
  const sessionId = useChatStore.getState().activeSessionId;
  if (!sessionId) return;
  void import("../../../chatRuntime").then(({ stopOwnedChat }) =>
    stopOwnedChat(sessionId)
  );
}
