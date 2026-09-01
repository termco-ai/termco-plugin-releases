import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { createCodexAdapter } from "./codexAdapter";

function fixtureLines(name: string): string[] {
  return readFileSync(join(__dirname, "__fixtures__", name), "utf8")
    .split("\n")
    .filter(Boolean);
}

function parseAll(lines: string[]) {
  const a = createCodexAdapter();
  return lines.flatMap((l) => a.parseLine(l));
}

describe("codex adapter — buildCommand", () => {
  it("builds a non-interactive json exec invocation with the prompt last", () => {
    const cmd = createCodexAdapter().buildCommand({
      runId: "r1",
      backend: "codex",
      prompt: "refactor auth",
      cwd: "/repo",
    });
    expect(cmd.bin).toBe("codex");
    expect(cmd.args[0]).toBe("exec");
    expect(cmd.args).toContain("--json");
    expect(cmd.args[cmd.args.length - 1]).toBe("refactor auth");
  });

  it("puts `resume <id>` right after exec (subcommand), prompt last", () => {
    const cmd = createCodexAdapter().buildCommand({
      runId: "r",
      backend: "codex",
      prompt: "continue",
      cwd: "/r",
      resumeSessionId: "cx-42",
    });
    expect(cmd.args.slice(0, 4)).toEqual(["exec", "resume", "cx-42", "--json"]);
    expect(cmd.args[cmd.args.length - 1]).toBe("continue");
  });

  it("maps permission modes to codex sandbox flags", () => {
    const bypass = createCodexAdapter().buildCommand({
      runId: "r",
      backend: "codex",
      prompt: "p",
      cwd: "/r",
      permissionMode: "bypass",
    });
    expect(bypass.args).toContain("--dangerously-bypass-approvals-and-sandbox");

    // This CLI version removed `--full-auto`; acceptEdits
    // maps to the workspace-write sandbox, plan to read-only.
    const edits = createCodexAdapter().buildCommand({
      runId: "r",
      backend: "codex",
      prompt: "p",
      cwd: "/r",
      permissionMode: "acceptEdits",
    });
    expect(edits.args).not.toContain("--full-auto");
    const si = edits.args.indexOf("--sandbox");
    expect(edits.args[si + 1]).toBe("workspace-write");

    const plan = createCodexAdapter().buildCommand({
      runId: "r",
      backend: "codex",
      prompt: "p",
      cwd: "/r",
      permissionMode: "plan",
    });
    expect(plan.args[plan.args.indexOf("--sandbox") + 1]).toBe("read-only");

    const dflt = createCodexAdapter().buildCommand({
      runId: "r",
      backend: "codex",
      prompt: "p",
      cwd: "/r",
      permissionMode: "default",
    });
    expect(dflt.args).not.toContain("--sandbox");

    for (const cmd of [bypass, edits, plan, dflt]) {
      expect(cmd.args).toContain("--skip-git-repo-check");
    }
  });

  it("passes reasoning effort as a -c config override", () => {
    const cmd = createCodexAdapter().buildCommand({
      runId: "r",
      backend: "codex",
      prompt: "p",
      cwd: "/r",
      effort: "high",
    });
    const i = cmd.args.indexOf("-c");
    expect(i).toBeGreaterThan(-1);
    expect(cmd.args[i + 1]).toBe("model_reasoning_effort=high");
  });
});

describe("codex adapter — current input contract", () => {
  it("ignores blank, non-JSON, typeless, and obsolete wrapped lines", () => {
    const a = createCodexAdapter();
    expect(a.parseLine("")).toEqual([]);
    expect(a.parseLine("~~~")).toEqual([]);
    expect(a.parseLine(JSON.stringify({}))).toEqual([]);
    expect(
      a.parseLine(JSON.stringify({ msg: { type: "thread.started", thread_id: "old" } })),
    ).toEqual([]);
  });
});

// Live captures from CLI version 0.147.0:
// flat thread/turn/item events, no deltas, no stdin approvals.
describe("codex adapter — current schema (0.147.0 fixtures)", () => {
  it("parses the simple exchange fixture: session, text, turn-end with usage", () => {
    const evs = parseAll(fixtureLines("codex-exec-simple.ndjson"));
    expect(evs).toEqual([
      {
        type: "session",
        sessionId: "019ff80b-0ab8-7f51-b8cf-4ef877fd0f6e",
      },
      { type: "text", text: "pong" },
      {
        type: "turn-end",
        usage: { inputTokens: 16944, outputTokens: 5, cachedInputTokens: 11008 },
      },
    ]);
  });

  it("parses the command fixture: item.started/completed become one shell call", () => {
    const evs = parseAll(fixtureLines("codex-exec-command.ndjson"));
    expect(evs).toEqual([
      {
        type: "session",
        sessionId: "019ff80b-cd9a-7d81-afc0-c22dffe130bb",
      },
      { type: "text", text: "I’ll run that exact command and report its output." },
      {
        type: "tool-start",
        toolCallId: "item_1",
        name: "shell",
        input: { command: "/bin/zsh -lc 'echo hello-fixture'" },
      },
      { type: "tool-end", toolCallId: "item_1", output: "hello-fixture\n" },
      { type: "text", text: "`hello-fixture`" },
      {
        type: "turn-end",
        usage: { inputTokens: 33984, outputTokens: 126, cachedInputTokens: 27136 },
      },
    ]);
  });

  it("synthesizes a tool-start for a completed command with no started event", () => {
    const evs = parseAll([
      JSON.stringify({
        type: "item.completed",
        item: {
          id: "item_9",
          type: "command_execution",
          command: "ls",
          aggregated_output: "a\n",
          exit_code: 0,
          status: "completed",
        },
      }),
    ]);
    expect(evs).toEqual([
      { type: "tool-start", toolCallId: "item_9", name: "shell", input: { command: "ls" } },
      { type: "tool-end", toolCallId: "item_9", output: "a\n" },
    ]);
  });

  it("marks a failed command as a tool error", () => {
    const evs = parseAll([
      JSON.stringify({
        type: "item.completed",
        item: {
          id: "item_2",
          type: "command_execution",
          command: "boom",
          aggregated_output: "no such file\n",
          exit_code: 1,
          status: "failed",
        },
      }),
    ]);
    expect(evs[1]).toEqual({
      type: "tool-end",
      toolCallId: "item_2",
      error: "no such file\n",
    });
  });

  it("maps reasoning items and turn.failed", () => {
    expect(
      parseAll([
        JSON.stringify({
          type: "item.completed",
          item: { id: "item_0", type: "reasoning", text: "thinking…" },
        }),
      ]),
    ).toEqual([{ type: "reasoning", text: "thinking…" }]);
    expect(
      parseAll([
        JSON.stringify({ type: "turn.failed", error: { message: "quota exceeded" } }),
      ]),
    ).toEqual([{ type: "error", message: "quota exceeded", fatal: true }]);
  });
});
// Owned by the coding-agent-native provider plugin.
