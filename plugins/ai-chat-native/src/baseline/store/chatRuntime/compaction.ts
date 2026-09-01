import type { UIMessage } from "@ai-sdk/react";
import type { AiToolRuntime } from "@termco/ai-tools-base";
import { SessionId, type CompactionPolicyState } from "@termco/session-base";
import { convertToModelMessages, type ModelMessage } from "ai";
import { toast } from "sonner";
import { buildSessionTools } from "../../../chatRuntime";
import {
  beginOwnedCompaction,
  appendSessionEvents,
  failOwnedCompaction,
  finishOwnedCompaction,
  modelContextLimit,
  planOwnedCompaction,
  readOwnedSession,
  resolveAvailableModel,
} from "../../../runtime";
import { chats, toolContexts } from "../../../store/registry";
import { aiSessionsCapability, useChatStore } from "../../../store/store";
import {
  groupMessages,
  MIN_GROUPS,
  preserveCount,
  sanitizeTail,
  splitAtGroup,
} from "../../lib/compact/groups";
import {
  MIN_HEAD_TOKENS,
  shouldCollapseChain,
  summarizeConversation,
  type SummaryChain,
} from "../../lib/compact/summary";
import {
  computeThresholds,
  contextLevel,
  type ContextThresholds,
} from "../../lib/compact/thresholds";
import { countModelMessages, countUIMessages } from "../../lib/tokens";
import { compactionInference } from "../../runtime/compactionRuntime";
import { usePreferencesStore } from "../../runtime/preferences";
import { selectedAgent } from "../agentsStore";
import {
  breakerVerdict,
  IDLE_HEALTH,
  onCompactionFailed,
  onCompactionSucceeded,
  onManualSuccess,
} from "./compactionHealth";
import { cancelCompaction, isCompacting, running } from "./compactionState";

const COMPACTION_TIMEOUT_MS = 90_000;
const OVERSIZED_GROUP_RATIO = 0.5;

export { cancelCompaction, isCompacting };

function runModelId(): string {
  return selectedAgent()?.model?.trim() || useChatStore.getState().selectedModelId;
}

function summaryModel(): {
  modelId: string;
  fallbackModelId?: string;
  contextLimit: number;
} {
  const run = runModelId();
  const preferences = usePreferencesStore.getState();
  const configured = preferences.compactionModelId.trim();
  const selected =
    configured && resolveAvailableModel(configured, preferences.customEndpoints)
      ? configured
      : run;
  return {
    modelId: selected,
    fallbackModelId: selected === run ? undefined : run,
    contextLimit: modelContextLimit(selected, preferences.customEndpoints),
  };
}

export function activeContextLimit(): number {
  const preferences = usePreferencesStore.getState();
  return modelContextLimit(runModelId(), preferences.customEndpoints);
}

export function activeThresholds(): ContextThresholds {
  return computeThresholds(activeContextLimit(), {
    userTriggerTokens: usePreferencesStore.getState().compactThresholdTokens,
  });
}

export function estimateSessionTokens(sessionId: string): number {
  const messages = chats.get(sessionId)?.messages ?? [];
  const compaction = useChatStore
    .getState()
    .sessions.find((session) => session.id === sessionId)?.compaction;
  const summaryCharacters =
    compaction?.blocks.reduce((total, block) => total + block.length, 0) ?? 0;
  return (
    countUIMessages(messages, { modelId: runModelId(), fast: true }) +
    Math.ceil(summaryCharacters / 4)
  );
}

export function contextUsed(sessionId: string): number {
  return (
    useChatStore.getState().agentMeta.lastInputTokens ||
    estimateSessionTokens(sessionId)
  );
}

export function contextFillRatio(sessionId: string): number {
  const limit = activeContextLimit();
  return limit > 0 ? contextUsed(sessionId) / limit : 0;
}

export function atHardCeiling(sessionId: string): boolean {
  const level = contextLevel(contextUsed(sessionId), activeThresholds());
  return level === "warn" || level === "compact" || level === "blocked";
}

export function shouldCompactBeforeSend(sessionId: string): boolean {
  const state = useChatStore.getState();
  const session = state.sessions.find((entry) => entry.id === sessionId);
  if (session?.compactionPolicy?.declined) {
    if (contextLevel(contextUsed(sessionId), activeThresholds()) === "ok") {
      void recordPolicy(sessionId, {
        declined: false,
        health: session.compactionPolicy.health,
      }, "context-recovered");
    }
    return false;
  }
  if (!breakerVerdict(session?.compactionPolicy?.health, Date.now()).allowed) return false;
  const level = contextLevel(contextUsed(sessionId), activeThresholds());
  return level === "compact" || level === "blocked";
}

export function compactionBlockedReason(sessionId: string): string | null {
  const session = useChatStore
    .getState()
    .sessions.find((entry) => entry.id === sessionId);
  const verdict = breakerVerdict(session?.compactionPolicy?.health, Date.now());
  if (verdict.allowed || verdict.reason === "backoff") return null;
  return verdict.message;
}

export type CompactionMode =
  | "manual"
  | "automatic"
  | "proactive"
  | "reactive";

export type CompactionRequest = {
  sessionId: string;
  mode: CompactionMode;
  instructions?: string;
  silent?: boolean;
  tokenGap?: number;
  attempt?: number;
};

export type CompactionResult =
  | { ok: true; sessionId: string }
  | {
      ok: false;
      reason:
        | "busy"
        | "too-short"
        | "cancelled"
        | "failed"
        | "timeout"
        | "stale"
        | "incompressible";
    };

function fingerprint(messages: readonly UIMessage[]): string {
  return `${messages.length}:${messages.at(-1)?.id ?? ""}`;
}

async function withTimeout<T>(
  work: Promise<T>,
  milliseconds: number,
  onTimeout: () => void,
): Promise<T | "timed-out"> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<"timed-out">((resolve) => {
    timer = setTimeout(() => {
      onTimeout();
      resolve("timed-out");
    }, milliseconds);
  });
  try {
    return await Promise.race([work, timeout]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

async function recordPolicy(
  sessionId: string,
  policy: CompactionPolicyState,
  reason: "failure" | "success" | "manual-success" | "declined" | "context-recovered",
): Promise<void> {
  await appendSessionEvents(sessionId, [{ type: "compaction/policy", time: Date.now(), data: { ...policy, reason } }]);
  useChatStore.getState().patchSession(sessionId, { compactionPolicy: policy });
}

export async function refreshCompactionPolicy(sessionId: string): Promise<void> {
  const restored = await readOwnedSession(sessionId);
  useChatStore.getState().patchSession(sessionId, { compactionPolicy: restored.compactionPolicy });
}

export function declineAutomaticCompaction(sessionId: string): Promise<void> {
  const current = useChatStore.getState().sessions.find((entry) => entry.id === sessionId)?.compactionPolicy;
  return recordPolicy(sessionId, {
    declined: true,
    health: current?.health ?? { ...IDLE_HEALTH },
  }, "declined");
}

async function noteFailure(sessionId: string): Promise<void> {
  const store = useChatStore.getState();
  const session = store.sessions.find((entry) => entry.id === sessionId);
  await recordPolicy(sessionId, {
    declined: session?.compactionPolicy?.declined ?? false,
    health: onCompactionFailed(session?.compactionPolicy?.health, Date.now()),
  }, "failure");
}

export async function runCompaction(
  request: CompactionRequest,
): Promise<CompactionResult> {
  const { sessionId, mode } = request;
  const state = useChatStore.getState();
  if (running.has(sessionId)) return { ok: false, reason: "busy" };

  const chat = chats.get(sessionId);
  const messages = chat?.messages ?? [];
  if (messages.length === 0) {
    if (!request.silent) toast.info("Nothing to compact yet");
    return { ok: false, reason: "too-short" };
  }
  if (
    mode !== "reactive" &&
    (chat?.status === "streaming" || chat?.status === "submitted")
  ) {
    if (!request.silent) {
      toast.info("Wait for the current run to finish, then /compact");
    }
    return { ok: false, reason: "busy" };
  }

  const source = state.sessions.find((session) => session.id === sessionId);
  const contextLimit = activeContextLimit();
  const groups = groupMessages(messages);
  if (groups.length < MIN_GROUPS) {
    if (!request.silent) toast.info("Not enough conversation to compact yet");
    return { ok: false, reason: "incompressible" };
  }

  const oversized =
    (groups.at(-1)?.tokens ?? 0) > OVERSIZED_GROUP_RATIO * contextLimit;
  const preserve = oversized
    ? 0
    : preserveCount(groups, {
        tokenGap: request.tokenGap,
        min: request.attempt ? request.attempt + 1 : undefined,
      });
  const split = splitAtGroup(groups, Math.max(1, preserve));
  const headMessages = oversized ? messages : split.head;
  const tailMessages = oversized ? [] : sanitizeTail(split.tail);
  const snapshot = fingerprint(messages);
  const controller = new AbortController();
  running.set(sessionId, controller);
  const startedAt = Date.now();
  let ownedAttempt:
    | { sessionId: string; compactionId: string; closed: boolean }
    | undefined;
  state.patchAgentMeta({ compacting: { startedAt, sessionId } });

  try {
    const runtime = toolContexts.get(sessionId) as AiToolRuntime | undefined;
    const tools = runtime ? buildSessionTools(runtime) : undefined;
    const history: ModelMessage[] = await convertToModelMessages(headMessages, {
      tools: tools as never,
      ignoreIncompleteToolCalls: true,
    });
    const modelId = runModelId();
    const headTokens = countModelMessages(history, { modelId });
    if (headTokens < MIN_HEAD_TOKENS) {
      if (!request.silent) {
        toast.info(
          `Not enough to compact yet — about ${Math.round(headTokens / 100) / 10}k tokens would be summarised, and the summary itself costs nearly that.`,
        );
      }
      return { ok: false, reason: "too-short" };
    }

    const lastHeadMessage = headMessages.at(-1);
    if (!lastHeadMessage) {
      throw new Error("Canonical compaction candidate has no final message");
    }
    const plan = await planOwnedCompaction(sessionId, lastHeadMessage.id);
    const previousBlocks = plan.previous?.blocks ?? [];
    const previousTranscripts = plan.previous?.transcriptIds ?? [];
    const chain: SummaryChain = {
      blocks: previousBlocks,
      transcriptIds: previousTranscripts,
    };

    const collapse =
      previousBlocks.length === 0 || shouldCollapseChain(chain, contextLimit);
    const summaryInput: ModelMessage[] =
      collapse && previousBlocks.length > 0
        ? [
            {
              role: "user",
              content: `Summaries of the earlier conversation:\n\n${previousBlocks.join("\n\n")}`,
            },
            ...history,
          ]
        : history;
    const title = source?.title ?? "Chat";
    ownedAttempt = {
      ...(await beginOwnedCompaction({
        sourceSessionId: sessionId,
        plan,
        title: title.startsWith("↺ ") ? title : `↺ ${title}`,
        trigger: mode === "manual"
          ? "manual"
          : mode === "reactive"
            ? "provider-overflow"
            : "automatic",
        measuredTokens: contextUsed(sessionId),
      })),
      closed: false,
    };
    const summary = await withTimeout(
      summarizeConversation({
        inference: compactionInference(),
        ...summaryModel(),
        head: summaryInput,
        abortSignal: controller.signal,
        extraInstructions: request.instructions,
        sessionId,
        recentPortion: !collapse,
        tailPreserved: tailMessages.length > 0,
      }),
      COMPACTION_TIMEOUT_MS,
      () => controller.abort(),
    );
    if (summary === "timed-out") {
      await failOwnedCompaction({
        ...ownedAttempt,
        outcome: "failed",
        error: Object.assign(new Error("Compaction timed out"), {
          code: "COMPACTION_TIMEOUT",
        }),
      });
      ownedAttempt.closed = true;
      if (!request.silent) {
        toast.error("Compaction timed out — nothing was changed");
      }
      await noteFailure(sessionId);
      return { ok: false, reason: "timeout" };
    }
    if (controller.signal.aborted) {
      await failOwnedCompaction({ ...ownedAttempt, outcome: "cancelled" });
      ownedAttempt.closed = true;
      return { ok: false, reason: "cancelled" };
    }
    if (!summary) {
      await failOwnedCompaction({
        ...ownedAttempt,
        outcome: "failed",
        error: Object.assign(new Error("Compaction produced no summary"), {
          code: "EMPTY_COMPACTION_SUMMARY",
        }),
      });
      ownedAttempt.closed = true;
      if (!request.silent) {
        toast.error("Compaction failed — nothing was changed");
      }
      await noteFailure(sessionId);
      return { ok: false, reason: "failed" };
    }
    if (fingerprint(chats.get(sessionId)?.messages ?? []) !== snapshot) {
      await failOwnedCompaction({ ...ownedAttempt, outcome: "cancelled" });
      ownedAttempt.closed = true;
      return { ok: false, reason: "stale" };
    }

    const transcriptIds = [...previousTranscripts, sessionId];
    const automatic = mode !== "manual";
    const compactionRequest = {
      modelId: summaryModel().modelId,
      sourceSessionIds: transcriptIds,
      droppedCount: headMessages.length,
      tailCount: tailMessages.length,
      summarizedGroups: oversized ? groups.length : split.headGroups,
      preservedGroups: oversized ? 0 : split.tailGroups,
      preTokens: contextUsed(sessionId),
      durationMs: Date.now() - startedAt,
    };
    await finishOwnedCompaction({
      ...ownedAttempt,
      plan,
      summary,
      blocks: collapse ? [summary] : [...previousBlocks, summary],
      request: compactionRequest,
    });
    ownedAttempt.closed = true;
    const carriedTokens = useChatStore.getState().agentMeta.tokens;
    const health = automatic
      ? onCompactionSucceeded(source?.compactionPolicy?.health, Date.now())
      : onManualSuccess();
    const nextSessionId = ownedAttempt.sessionId;
    await recordPolicy(nextSessionId, {
      declined: false,
      health,
    }, automatic ? "success" : "manual-success");
    await aiSessionsCapability.openSession(SessionId(nextSessionId));
    useChatStore.getState().patchAgentMeta({ tokens: carriedTokens });
    return { ok: true, sessionId: nextSessionId };
  } catch (error) {
    if (ownedAttempt && !ownedAttempt.closed) {
      try {
        await failOwnedCompaction({ ...ownedAttempt, outcome: "failed", error });
        ownedAttempt.closed = true;
      } catch (closeError) {
        console.error("[compaction] failed to close canonical attempt:", closeError);
      }
    }
    console.error("[compaction] failed:", error);
    if (!request.silent) {
      toast.error("Compaction failed — nothing was changed");
    }
    await noteFailure(sessionId);
    return { ok: false, reason: "failed" };
  } finally {
    running.delete(sessionId);
    const metadata = useChatStore.getState().agentMeta;
    if (metadata.compacting?.sessionId === sessionId) {
      useChatStore.getState().patchAgentMeta({ compacting: null });
    }
  }
}
