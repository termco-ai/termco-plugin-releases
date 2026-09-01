import { describe, expect, it } from "vitest";
import { createClaudeAdapter } from "./claudeAdapter";

function parse(lines: string[]) {
  const a = createClaudeAdapter();
  return lines.flatMap((l) => a.parseLine(l));
}

describe("claude adapter — buildCommand", () => {
  it("builds a headless streaming invocation", () => {
    const cmd = createClaudeAdapter().buildCommand({
      runId: "r1",
      backend: "claude",
      prompt: "do the thing",
      cwd: "/repo",
    });
    expect(cmd.bin).toBe("claude");
    // NO --include-partial-messages: we drive from complete messages to avoid
    // the partial+complete doubling.
    expect(cmd.args).toEqual([
      "-p",
      "do the thing",
      "--output-format",
      "stream-json",
      "--verbose",
    ]);
    expect(cmd.args).not.toContain("--include-partial-messages");
  });

  it("maps reasoning effort onto a MAX_THINKING_TOKENS budget", () => {
    const high = createClaudeAdapter().buildCommand({
      runId: "r1",
      backend: "claude",
      prompt: "p",
      cwd: "/repo",
      effort: "high",
    });
    expect(high.env?.MAX_THINKING_TOKENS).toBe("31999");
    const low = createClaudeAdapter().buildCommand({
      runId: "r1",
      backend: "claude",
      prompt: "p",
      cwd: "/repo",
      effort: "low",
    });
    expect(low.env?.MAX_THINKING_TOKENS).toBe("4096");
    // "minimal" disables extended thinking → no env var.
    const minimal = createClaudeAdapter().buildCommand({
      runId: "r1",
      backend: "claude",
      prompt: "p",
      cwd: "/repo",
      effort: "minimal",
    });
    expect(minimal.env).toBeUndefined();
  });

  it("installs a PreToolUse approval hook when an approvalEndpoint is set", () => {
    const cmd = createClaudeAdapter().buildCommand({
      runId: "r7",
      backend: "claude",
      prompt: "p",
      cwd: "/repo",
      approvalEndpoint: "http://127.0.0.1:5599",
    });
    const i = cmd.args.indexOf("--settings");
    expect(i).toBeGreaterThan(-1);
    const settings = JSON.parse(cmd.args[i + 1]);
    expect(settings.hooks.PreToolUse[0].hooks[0].command).toContain(
      "http://127.0.0.1:5599/permit?run=r7",
    );
  });

  it("hook matches mutating + MCP tools only, with the long approval timeout", () => {
    const cmd = createClaudeAdapter().buildCommand({
      runId: "r7",
      backend: "claude",
      prompt: "p",
      cwd: "/repo",
      approvalEndpoint: "http://127.0.0.1:5599",
    });
    const settings = JSON.parse(cmd.args[cmd.args.indexOf("--settings") + 1]);
    const entry = settings.hooks.PreToolUse[0];
    const matcher = new RegExp(entry.matcher);
    // Mutating built-ins and MCP tools go through the user…
    for (const t of ["Write", "Edit", "MultiEdit", "Bash", "WebFetch", "mcp__jira__create"]) {
      expect(matcher.test(t)).toBe(true);
    }
    // …read-only tools never round-trip (they'd card every file read).
    for (const t of ["Read", "Grep", "Glob", "TodoWrite", "Task"]) {
      expect(matcher.test(t)).toBe(false);
    }
    // The backend kills hooks after 60s by default, far under the driver's
    // 9-minute approval wait, which turned unanswered cards into silent denies.
    expect(entry.hooks[0].timeout).toBe(600);
  });

  it("omits the approval hook when no endpoint is set", () => {
    const cmd = createClaudeAdapter().buildCommand({
      runId: "r",
      backend: "claude",
      prompt: "p",
      cwd: "/repo",
    });
    expect(cmd.args).not.toContain("--settings");
  });

  it("adds model, permission mode, and resume flags", () => {
    const cmd = createClaudeAdapter().buildCommand({
      runId: "r1",
      backend: "claude",
      prompt: "p",
      cwd: "/repo",
      model: "claude-opus-4-8",
      permissionMode: "bypass",
      resumeSessionId: "sess-9",
    });
    expect(cmd.args).toContain("--model");
    expect(cmd.args).toContain("claude-opus-4-8");
    expect(cmd.args).toContain("--permission-mode");
    expect(cmd.args).toContain("bypassPermissions");
    expect(cmd.args).toContain("--resume");
    expect(cmd.args).toContain("sess-9");
  });
});

describe("claude adapter — parseLine", () => {
  it("ignores blank and non-JSON lines", () => {
    const a = createClaudeAdapter();
    expect(a.parseLine("")).toEqual([]);
    expect(a.parseLine("not json")).toEqual([]);
  });

  it("maps system/init to a session event", () => {
    const [ev] = parse([
      JSON.stringify({
        type: "system",
        subtype: "init",
        session_id: "sess-1",
        model: "claude-opus-4-8",
        cwd: "/repo",
      }),
    ]);
    expect(ev).toEqual({
      type: "session",
      sessionId: "sess-1",
      model: "claude-opus-4-8",
      cwd: "/repo",
    });
  });

  it("maps an assistant message with text + tool_use blocks", () => {
    const evs = parse([
      JSON.stringify({
        type: "assistant",
        message: {
          content: [
            { type: "text", text: "I'll read it." },
            { type: "tool_use", id: "t1", name: "read_file", input: { path: "a.ts" } },
          ],
        },
      }),
    ]);
    expect(evs).toEqual([
      { type: "message-start" },
      { type: "text", text: "I'll read it." },
      { type: "tool-start", toolCallId: "t1", name: "read_file", input: { path: "a.ts" } },
      { type: "message-end" },
    ]);
  });

  it("maps thinking blocks to reasoning", () => {
    const evs = parse([
      JSON.stringify({
        type: "assistant",
        message: { content: [{ type: "thinking", thinking: "hmm" }] },
      }),
    ]);
    expect(evs).toContainEqual({ type: "reasoning", text: "hmm" });
  });

  it("maps a user tool_result to tool-end (success and error)", () => {
    const ok = parse([
      JSON.stringify({
        type: "user",
        message: { content: [{ type: "tool_result", tool_use_id: "t1", content: "hello" }] },
      }),
    ]);
    expect(ok).toEqual([{ type: "tool-end", toolCallId: "t1", output: "hello" }]);

    const err = parse([
      JSON.stringify({
        type: "user",
        message: {
          content: [{ type: "tool_result", tool_use_id: "t2", content: "nope", is_error: true }],
        },
      }),
    ]);
    expect(err).toEqual([{ type: "tool-end", toolCallId: "t2", error: "nope" }]);
  });

  it("ignores stream_event partials entirely (no doubling)", () => {
    // We don't request partials; even if one appears, it must not emit anything
    // that would duplicate the complete `assistant` message.
    const evs = parse([
      JSON.stringify({
        type: "stream_event",
        event: { type: "content_block_delta", delta: { type: "text_delta", text: "Hel" } },
      }),
      JSON.stringify({ type: "assistant", message: { content: [{ type: "text", text: "Hello" }] } }),
    ]);
    expect(evs).toEqual([
      { type: "message-start" },
      { type: "text", text: "Hello" },
      { type: "message-end" },
    ]);
  });

  it("maps result to turn-end with usage and cost", () => {
    const [ev] = parse([
      JSON.stringify({
        type: "result",
        subtype: "success",
        total_cost_usd: 0.0031,
        usage: { input_tokens: 100, output_tokens: 40, cache_read_input_tokens: 80 },
      }),
    ]);
    expect(ev).toEqual({
      type: "turn-end",
      usage: { inputTokens: 100, outputTokens: 40, cachedInputTokens: 80 },
      costUsd: 0.0031,
    });
  });
});
// Owned by the coding-agent-native provider plugin.
