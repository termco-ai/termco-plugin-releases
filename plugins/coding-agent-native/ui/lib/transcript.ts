/** Source-owned by the coding-agent-native plugin.
 * Pure transcript reducer: folds the normalized {@link AgentEvent} stream of a
 * single run into an AI-SDK `UIMessage[]` plus run status — the exact shape
 * `RenderedMessage` already renders, so a coding-agent run displays through the
 * same transcript components as the in-app chat.
 *
 * Everything here is a pure `(state, event) -> state` transition with no I/O and
 * no wall-clock/random dependency (ids derive from a monotonic `seq`), so it is
 * fully unit-testable and safe to replay when resuming a run from history.
 */

import type { UIMessage } from "ai";
import type { AgentEvent, AgentRunStatus, AgentUsage } from "./protocol";

/** A single assistant/user message part, loosely typed to match the renderer. */
type Part = Record<string, unknown> & { type: string };

/** Immutable-ish reducer state for one run's transcript. */
export type TranscriptState = {
  runId: string;
  /** Monotonic counter backing deterministic message ids. */
  seq: number;
  messages: UIMessage[];
  status: AgentRunStatus;
  sessionId: string | null;
  model: string | null;
  cwd: string | null;
  usage: AgentUsage | null;
  costUsd: number | null;
  /** The approvalId currently blocking the run, if any. */
  pendingApprovalId: string | null;
  error: string | null;
};

export function createTranscript(runId: string): TranscriptState {
  return {
    runId,
    seq: 0,
    messages: [],
    status: "starting",
    sessionId: null,
    model: null,
    cwd: null,
    usage: null,
    costUsd: null,
    pendingApprovalId: null,
    error: null,
  };
}

const msgId = (runId: string, seq: number) => `${runId}:m${seq}`;

/** The trailing assistant message, or null if the last message isn't one. */
function currentAssistant(s: TranscriptState): UIMessage | null {
  const last = s.messages[s.messages.length - 1];
  return last?.role === "assistant" ? last : null;
}

/** Return a copy of `messages` with `msg` replacing the entry at `idx`. */
function replaceAt(
  messages: UIMessage[],
  idx: number,
  msg: UIMessage,
): UIMessage[] {
  const next = messages.slice();
  next[idx] = msg;
  return next;
}

/** Clone a message with new parts (parts are treated as immutable). */
function withParts(msg: UIMessage, parts: Part[]): UIMessage {
  return { ...msg, parts: parts as UIMessage["parts"] };
}

/**
 * Ensure there's a live assistant message to append to, creating one if the
 * last message isn't an assistant message. Returns the (possibly new) state and
 * the index of the assistant message to mutate.
 */
function ensureAssistant(s: TranscriptState): {
  state: TranscriptState;
  idx: number;
} {
  const existing = currentAssistant(s);
  if (existing) return { state: s, idx: s.messages.length - 1 };
  const seq = s.seq + 1;
  const msg: UIMessage = {
    id: msgId(s.runId, seq),
    role: "assistant",
    parts: [],
  };
  return {
    state: { ...s, seq, messages: [...s.messages, msg] },
    idx: s.messages.length,
  };
}

/** Append a complete user message (a follow-up prompt) to the transcript. */
export function appendUserMessage(
  s: TranscriptState,
  text: string,
): TranscriptState {
  const seq = s.seq + 1;
  const msg: UIMessage = {
    id: msgId(s.runId, seq),
    role: "user",
    parts: [{ type: "text", text }] as UIMessage["parts"],
  };
  return { ...s, seq, messages: [...s.messages, msg], status: "running" };
}

/** Fold one normalized event into the transcript state. */
export function applyEvent(s: TranscriptState, e: AgentEvent): TranscriptState {
  switch (e.type) {
    case "session":
      return {
        ...s,
        sessionId: e.sessionId,
        model: e.model ?? s.model,
        cwd: e.cwd ?? s.cwd,
        status: s.status === "starting" ? "running" : s.status,
      };

    case "message-start": {
      // Force a fresh assistant message even if one is already trailing.
      const seq = s.seq + 1;
      const msg: UIMessage = {
        id: msgId(s.runId, seq),
        role: "assistant",
        parts: [],
      };
      return { ...s, seq, messages: [...s.messages, msg], status: "running" };
    }

    case "text-delta":
    case "text": {
      const { state, idx } = ensureAssistant({ ...s, status: "running" });
      const msg = state.messages[idx];
      const parts = msg.parts.slice() as Part[];
      const lastIdx = parts.length - 1;
      const trailing =
        lastIdx >= 0 && parts[lastIdx].type === "text" ? parts[lastIdx] : null;
      if (e.type === "text-delta" && trailing) {
        parts[lastIdx] = {
          ...trailing,
          text: `${trailing.text as string}${e.text}`,
        };
      } else if (e.type === "text-delta") {
        parts.push({ type: "text", text: e.text, state: "streaming" });
      } else {
        // Complete block: replace a trailing streamed text part, else append.
        if (trailing) parts[lastIdx] = { type: "text", text: e.text };
        else parts.push({ type: "text", text: e.text });
      }
      return {
        ...state,
        messages: replaceAt(state.messages, idx, withParts(msg, parts)),
      };
    }

    case "reasoning-delta":
    case "reasoning": {
      const { state, idx } = ensureAssistant({ ...s, status: "running" });
      const msg = state.messages[idx];
      const parts = msg.parts.slice() as Part[];
      const lastIdx = parts.length - 1;
      const trailing =
        lastIdx >= 0 && parts[lastIdx].type === "reasoning"
          ? parts[lastIdx]
          : null;
      if (e.type === "reasoning-delta" && trailing) {
        parts[lastIdx] = {
          ...trailing,
          text: `${trailing.text as string}${e.text}`,
        };
      } else if (e.type === "reasoning-delta") {
        parts.push({ type: "reasoning", text: e.text, state: "streaming" });
      } else if (trailing) {
        parts[lastIdx] = { type: "reasoning", text: e.text };
      } else {
        parts.push({ type: "reasoning", text: e.text });
      }
      return {
        ...state,
        messages: replaceAt(state.messages, idx, withParts(msg, parts)),
      };
    }

    case "tool-start": {
      const { state, idx } = ensureAssistant({ ...s, status: "running" });
      const msg = state.messages[idx];
      const parts = msg.parts.slice() as Part[];
      const existing = findToolPart(parts, e.toolCallId);
      const toolPart: Part = {
        type: `tool-${e.name}`,
        toolCallId: e.toolCallId,
        state: "input-available",
        input: e.input ?? {},
      };
      if (existing >= 0) parts[existing] = { ...parts[existing], ...toolPart };
      else parts.push(toolPart);
      return {
        ...state,
        messages: replaceAt(state.messages, idx, withParts(msg, parts)),
      };
    }

    case "tool-end": {
      const idx = s.messages.length - 1;
      const msg = s.messages[idx];
      if (msg?.role !== "assistant") return s;
      const parts = msg.parts.slice() as Part[];
      const pIdx = findToolPart(parts, e.toolCallId);
      if (pIdx < 0) return s;
      parts[pIdx] = {
        ...parts[pIdx],
        state: e.error ? "output-error" : "output-available",
        ...(e.error ? { errorText: e.error } : { output: e.output ?? null }),
      };
      return {
        ...s,
        messages: replaceAt(s.messages, idx, withParts(msg, parts)),
      };
    }

    case "approval-request": {
      const { state, idx } = ensureAssistant({ ...s });
      const msg = state.messages[idx];
      const parts = msg.parts.slice() as Part[];
      const callId = e.toolCallId ?? e.approvalId;
      const existing = findToolPart(parts, callId);
      const part: Part = {
        type: `tool-${e.name}`,
        toolCallId: callId,
        state: "approval-requested",
        input: e.input ?? {},
        approval: { id: e.approvalId },
      };
      if (existing >= 0) parts[existing] = { ...parts[existing], ...part };
      else parts.push(part);
      return {
        ...state,
        status: "awaiting-approval",
        pendingApprovalId: e.approvalId,
        messages: replaceAt(state.messages, idx, withParts(msg, parts)),
      };
    }

    case "approval-cancelled": {
      // Find the tool part gated by this approval and mark it denied/errored so
      // the card stops blocking; unblock the run status.
      const idx = s.messages.length - 1;
      const msg = s.messages[idx];
      const label =
        e.reason === "timeout"
          ? "Approval timed out"
          : e.reason === "run-ended"
            ? "Run ended before approval"
            : "Approval superseded";
      const base =
        s.pendingApprovalId === e.approvalId
          ? { ...s, pendingApprovalId: null, status: "running" as const }
          : s;
      if (msg?.role !== "assistant") return base;
      const parts = msg.parts.slice() as Part[];
      const pIdx = parts.findIndex(
        (p) =>
          typeof p.type === "string" &&
          p.type.startsWith("tool-") &&
          (p.approval as { id?: string } | undefined)?.id === e.approvalId,
      );
      if (pIdx < 0) return base;
      parts[pIdx] = {
        ...parts[pIdx],
        state: "output-error",
        errorText: label,
        approval: undefined,
      };
      return {
        ...base,
        messages: replaceAt(base.messages, idx, withParts(msg, parts)),
      };
    }

    case "user-message":
      return appendUserMessage(s, e.text);

    case "message-end":
      return s;

    case "turn-end":
      return {
        ...finalizeStreaming(s),
        status: "idle",
        pendingApprovalId: null,
        usage: e.usage ?? s.usage,
        costUsd: e.costUsd ?? s.costUsd,
      };

    case "error":
      return {
        ...s,
        error: e.message,
        status: e.fatal ? "error" : s.status,
      };

    case "exit": {
      const base = finalizeStreaming(s);
      return {
        ...base,
        status:
          base.status === "error"
            ? "error"
            : base.status === "aborted" || e.aborted
              ? "aborted"
              : "done",
        pendingApprovalId: null,
      };
    }

    default: {
      // Exhaustiveness guard: a new event type must be handled above.
      const _never: never = e;
      return _never;
    }
  }
}

/** Clear `state:"streaming"` from any text/reasoning parts of the last assistant
 * message — called at turn/run end so a completed message doesn't keep a live
 * cursor. Returns `s` unchanged when there's nothing to finalize. */
function finalizeStreaming(s: TranscriptState): TranscriptState {
  const idx = s.messages.length - 1;
  const msg = s.messages[idx];
  if (msg?.role !== "assistant") return s;
  const parts = msg.parts as Part[];
  if (!parts.some((p) => p.state === "streaming")) return s;
  const next = parts.map((p) =>
    p.state === "streaming" ? { ...p, state: undefined } : p,
  );
  return { ...s, messages: replaceAt(s.messages, idx, withParts(msg, next)) };
}

/** Index of a tool part with the given call id, or -1. */
function findToolPart(parts: Part[], toolCallId: string): number {
  return parts.findIndex(
    (p) =>
      typeof p.type === "string" &&
      p.type.startsWith("tool-") &&
      p.toolCallId === toolCallId,
  );
}

/** Resolve an approval by clearing the pending flag (part state updates when the
 * tool actually starts/ends). Marks the run running again. */
export function resolveApproval(s: TranscriptState): TranscriptState {
  if (!s.pendingApprovalId) return s;
  return { ...s, pendingApprovalId: null, status: "running" };
}
