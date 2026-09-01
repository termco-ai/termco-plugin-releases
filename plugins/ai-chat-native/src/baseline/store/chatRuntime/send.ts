import type { Chat, UIMessage } from "@ai-sdk/react";
import { classifyOverflow, type OverflowInfo } from "../../lib/agent/overflowError";
import { modelContextLimit } from "../../../runtime";
import { usePreferencesStore } from "../../runtime/preferences";
import { hasKeyForModel, useChatStore } from "../chatStore";
import { runCompaction } from "./compaction";
import { getOrCreateChat } from "./index";
import { clearStreamOverflow, takeStreamOverflow } from "./overflow";

export const MAX_OVERFLOW_RETRIES = 3;

export type SendResult =
  | { ok: true; sessionId: string; compacted: boolean }
  | {
      ok: false;
      reason: "no-session" | "no-key" | "incompressible" | "failed";
      message?: string;
    };

function incompressibleMessage(info: OverflowInfo, modelId: string): string {
  const limit = info.limit ?? modelContextLimit(
    modelId,
    usePreferencesStore.getState().customEndpoints,
  );
  const size = info.actual != null
    ? ` — about ${Math.round(info.actual / 1000)}k tokens against a ${Math.round(limit / 1000)}k window`
    : "";
  return (
    `This single exchange is too large for ${modelId}${size}. ` +
    "Compacting cannot help: the size is in this one message, not in the history. " +
    "Remove attachments, read files in smaller chunks, or switch to a model with a larger window."
  );
}

function busy(chat: Chat<UIMessage>): boolean {
  return chat.status === "submitted" || chat.status === "streaming";
}

export async function runTurnWithOverflowRetry(
  sessionId: string,
  fire: (chat: Chat<UIMessage>) => Promise<void>,
): Promise<SendResult> {
  let current = sessionId;
  let compacted = false;
  for (let attempt = 0; attempt <= MAX_OVERFLOW_RETRIES; attempt += 1) {
    const chat = getOrCreateChat(current);
    clearStreamOverflow(current);
    useChatStore.getState().patchAgentMeta({ error: null });
    if (attempt === 0) await fire(chat);
    else await chat.sendMessage(undefined as never);
    const overflow = takeStreamOverflow(current) ?? classifyOverflow(chat.error ?? null);
    if (!overflow) return { ok: true, sessionId: current, compacted };
    const result = await runCompaction({
      sessionId: current,
      mode: "reactive",
      tokenGap: overflow.gap,
      attempt,
      silent: true,
    });
    if (result.ok) {
      current = result.sessionId;
      compacted = true;
      continue;
    }
    if (result.reason === "incompressible" || result.reason === "too-short") {
      const modelId = useChatStore.getState().selectedModelId;
      const message = incompressibleMessage(overflow, modelId);
      useChatStore.getState().patchAgentMeta({ status: "error", error: message });
      return { ok: false, reason: "incompressible", message };
    }
    return { ok: false, reason: "failed" };
  }
  return { ok: false, reason: "failed" };
}

async function prepareSend(
  sessionId: string,
): Promise<{ sessionId: string; compacted: boolean }> {
  const { declineAutomaticCompaction, refreshCompactionPolicy, shouldCompactBeforeSend } = await import("./compaction");
  await refreshCompactionPolicy(sessionId);
  if (!shouldCompactBeforeSend(sessionId)) return { sessionId, compacted: false };
  const chat = getOrCreateChat(sessionId);
  if (busy(chat)) return { sessionId, compacted: false };
  const result = await runCompaction({ sessionId, mode: "proactive", silent: true });
  if (result.ok) return { sessionId: result.sessionId, compacted: true };
  if (result.reason === "cancelled") {
    await declineAutomaticCompaction(sessionId);
  }
  return { sessionId, compacted: false };
}

export async function sendChatMessage(input: {
  sessionId?: string;
  parts: UIMessage["parts"];
  messageId?: string;
  metadata?: Record<string, unknown>;
}): Promise<SendResult> {
  const state = useChatStore.getState();
  const sessionId = input.sessionId ?? state.activeSessionId;
  if (!sessionId) return { ok: false, reason: "no-session" };
  if (!hasKeyForModel(state.selectedModelId)) return { ok: false, reason: "no-key" };
  let target = sessionId;
  let compacted = false;
  if (!input.messageId) {
    const prepared = await prepareSend(sessionId);
    target = prepared.sessionId;
    compacted = prepared.compacted;
  }
  const result = await runTurnWithOverflowRetry(target, (chat) =>
    chat.sendMessage({
      role: "user",
      parts: input.parts,
      ...(input.messageId ? { messageId: input.messageId } : {}),
      metadata: { createdAt: Date.now(), ...input.metadata },
    } as Parameters<typeof chat.sendMessage>[0]),
  );
  return result.ok ? { ...result, compacted: compacted || result.compacted } : result;
}
