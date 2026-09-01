// Source-owned by the coding-agent-native plugin.
import { describe, expect, it } from "vitest";
import type { AgentEvent } from "./protocol";
import {
  appendUserMessage,
  applyEvent,
  createTranscript,
  resolveApproval,
  type TranscriptState,
} from "./transcript";

/** Fold a sequence of events onto a fresh transcript. */
function run(events: AgentEvent[], runId = "r1"): TranscriptState {
  return events.reduce(applyEvent, createTranscript(runId));
}

/** Shorthand: the parts of the last assistant message. */
function lastParts(s: TranscriptState): Array<Record<string, unknown>> {
  const m = s.messages[s.messages.length - 1];
  return (m?.parts ?? []) as Array<Record<string, unknown>>;
}

describe("transcript reducer", () => {
  it("starts empty and in the starting state", () => {
    const s = createTranscript("r1");
    expect(s.messages).toEqual([]);
    expect(s.status).toBe("starting");
  });

  it("records the session and flips starting → running", () => {
    const s = run([
      { type: "session", sessionId: "sess-1", model: "opus", cwd: "/repo" },
    ]);
    expect(s.sessionId).toBe("sess-1");
    expect(s.model).toBe("opus");
    expect(s.cwd).toBe("/repo");
    expect(s.status).toBe("running");
  });

  it("streams text deltas into a single growing text part", () => {
    const s = run([
      { type: "message-start" },
      { type: "text-delta", text: "Hel" },
      { type: "text-delta", text: "lo " },
      { type: "text-delta", text: "world" },
    ]);
    expect(s.messages).toHaveLength(1);
    expect(s.messages[0].role).toBe("assistant");
    expect(lastParts(s)).toEqual([
      { type: "text", text: "Hello world", state: "streaming" },
    ]);
  });

  it("auto-creates an assistant message when text arrives with none open", () => {
    const s = run([{ type: "text", text: "hi" }]);
    expect(s.messages).toHaveLength(1);
    expect(s.messages[0].role).toBe("assistant");
    expect(lastParts(s)).toEqual([{ type: "text", text: "hi" }]);
  });

  it("finalizes a streamed text part when a complete block replaces it", () => {
    const s = run([
      { type: "text-delta", text: "partial" },
      { type: "text", text: "final" },
    ]);
    expect(lastParts(s)).toEqual([{ type: "text", text: "final" }]);
  });

  it("keeps reasoning and text as separate parts", () => {
    const s = run([
      { type: "reasoning-delta", text: "think" },
      { type: "text-delta", text: "answer" },
    ]);
    const parts = lastParts(s);
    expect(parts).toHaveLength(2);
    expect(parts[0]).toMatchObject({ type: "reasoning", text: "think" });
    expect(parts[1]).toMatchObject({ type: "text", text: "answer" });
  });

  it("models a tool call as a tool-<name> part that gains output", () => {
    const s = run([
      { type: "message-start" },
      {
        type: "tool-start",
        toolCallId: "t1",
        name: "read_file",
        input: { path: "a.ts" },
      },
      { type: "tool-end", toolCallId: "t1", output: "contents" },
    ]);
    const parts = lastParts(s);
    expect(parts).toHaveLength(1);
    expect(parts[0]).toMatchObject({
      type: "tool-read_file",
      toolCallId: "t1",
      state: "output-available",
      input: { path: "a.ts" },
      output: "contents",
    });
  });

  it("marks a failed tool as output-error with errorText", () => {
    const s = run([
      {
        type: "tool-start",
        toolCallId: "t1",
        name: "bash",
        input: { command: "x" },
      },
      { type: "tool-end", toolCallId: "t1", error: "boom" },
    ]);
    expect(lastParts(s)[0]).toMatchObject({
      state: "output-error",
      errorText: "boom",
    });
  });

  it("ignores a tool-end for an unknown call id", () => {
    const s = run([
      { type: "tool-start", toolCallId: "t1", name: "bash" },
      { type: "tool-end", toolCallId: "nope", output: "x" },
    ]);
    expect(lastParts(s)[0]).toMatchObject({ state: "input-available" });
  });

  it("raises an approval-requested part and blocks the run", () => {
    const s = run([
      { type: "message-start" },
      {
        type: "approval-request",
        approvalId: "ap1",
        toolCallId: "t1",
        name: "bash",
        input: { command: "rm -rf x" },
      },
    ]);
    expect(s.status).toBe("awaiting-approval");
    expect(s.pendingApprovalId).toBe("ap1");
    expect(lastParts(s)[0]).toMatchObject({
      type: "tool-bash",
      toolCallId: "t1",
      state: "approval-requested",
      approval: { id: "ap1" },
    });
  });

  it("approval-cancelled unblocks the run and marks the gated part errored", () => {
    const s = run([
      { type: "message-start" },
      {
        type: "approval-request",
        approvalId: "ap1",
        toolCallId: "t1",
        name: "bash",
        input: { command: "rm -rf x" },
      },
      { type: "approval-cancelled", approvalId: "ap1", reason: "timeout" },
    ]);
    expect(s.pendingApprovalId).toBeNull();
    expect(s.status).toBe("running");
    expect(lastParts(s)[0]).toMatchObject({
      type: "tool-bash",
      state: "output-error",
      errorText: "Approval timed out",
    });
  });

  it("transitions the SAME part approval-requested → executing when approved and run", () => {
    const s = run([
      {
        type: "approval-request",
        approvalId: "ap1",
        toolCallId: "t1",
        name: "bash",
        input: { command: "ls" },
      },
    ]);
    const resolved = resolveApproval(s);
    expect(resolved.pendingApprovalId).toBeNull();
    expect(resolved.status).toBe("running");
    const after = applyEvent(resolved, {
      type: "tool-start",
      toolCallId: "t1",
      name: "bash",
      input: { command: "ls" },
    });
    // Still one part (updated in place), no duplicate.
    expect(lastParts(after)).toHaveLength(1);
    expect(lastParts(after)[0]).toMatchObject({ state: "input-available" });
  });

  it("turn-end goes idle and captures usage + cost", () => {
    const s = run([
      { type: "text", text: "done" },
      {
        type: "turn-end",
        usage: { inputTokens: 10, outputTokens: 5 },
        costUsd: 0.002,
      },
    ]);
    expect(s.status).toBe("idle");
    expect(s.usage).toEqual({ inputTokens: 10, outputTokens: 5 });
    expect(s.costUsd).toBe(0.002);
  });

  it("a follow-up user message re-opens the turn and starts a new assistant msg", () => {
    let s = run([{ type: "text", text: "first answer" }, { type: "turn-end" }]);
    s = appendUserMessage(s, "now do X");
    expect(s.status).toBe("running");
    const roles = s.messages.map((m) => m.role);
    expect(roles).toEqual(["assistant", "user"]);
    // Next assistant text starts a distinct message, not appended to the user one.
    s = applyEvent(s, { type: "message-start" });
    s = applyEvent(s, { type: "text-delta", text: "second" });
    expect(s.messages.map((m) => m.role)).toEqual([
      "assistant",
      "user",
      "assistant",
    ]);
  });

  it("fatal error sets error status; exit finalizes to done", () => {
    const s = run([
      { type: "error", message: "network", fatal: true },
      { type: "exit", code: 1 },
    ]);
    expect(s.error).toBe("network");
    expect(s.status).toBe("error");
  });

  it("exit with aborted:true marks the run stopped, not done", () => {
    const s = run([
      { type: "message-start" },
      { type: "text-delta", text: "half" },
      { type: "exit", code: 143, aborted: true },
    ]);
    expect(s.status).toBe("aborted");
  });

  it("turn-end clears the streaming cursor on the trailing text part", () => {
    const s = run([
      { type: "message-start" },
      { type: "text-delta", text: "streaming answer" },
      { type: "turn-end" },
    ]);
    expect(lastParts(s)).toEqual([
      { type: "text", text: "streaming answer", state: undefined },
    ]);
    expect(s.status).toBe("idle");
  });

  it("exit after a clean turn finalizes to done", () => {
    const s = run([
      { type: "text", text: "ok" },
      { type: "turn-end" },
      { type: "exit", code: 0 },
    ]);
    expect(s.status).toBe("done");
  });

  it("generates unique, deterministic message ids", () => {
    const s = run([
      { type: "message-start" },
      { type: "text", text: "a" },
      { type: "turn-end" },
    ]);
    const s2 = appendUserMessage(s, "b");
    const ids = s2.messages.map((m) => m.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids[0]).toBe("r1:m1");
  });
});
