/**
 * Incremental history summaries: a GROWN transcript (the live CLI appending)
 * must be summarized by parsing ONLY the appended bytes — the full re-parse of
 * an ever-growing multi-MB transcript on every watcher event was a sustained
 * ~16% CPU burn while the history/roster was open (measured ~99ms CPU per
 * 30MB per refresh). A rewritten/shrunk file must fall back to a full parse.
 */
import { appendFileSync, mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({ tmp: "" }));
vi.mock("node:os", async (orig) => {
  const actual = await orig<typeof import("node:os")>();
  return { ...actual, homedir: () => h.tmp };
});

// Track every createReadStream call so tests can assert HOW MUCH was read:
// a delta refresh must never re-stream the file from byte 0 without an `end`
// bound (probe reads are bounded; the delta read starts past 0).
const reads = vi.hoisted(() => ({
  calls: [] as Array<{ start?: number; end?: number }>,
}));
vi.mock("node:fs", async (orig) => {
  const actual = await orig<typeof import("node:fs")>();
  return {
    ...actual,
    createReadStream: (
      path: Parameters<typeof actual.createReadStream>[0],
      opts?: Record<string, unknown>,
    ) => {
      reads.calls.push({
        start: opts?.start as number | undefined,
        end: opts?.end as number | undefined,
      });
      return actual.createReadStream(path, opts as never);
    },
  };
});

const { listAllSessions } = await import("./sessions");
const { listCodexSessions } = await import("./codexSessions");
const { resetSummaryDiskCacheForTests } = await import("./summaryDiskCache");

const L = (o: unknown) => JSON.stringify(o);
const SID = "11111111-2222-3333-4444-555555555555";

function claudeDir(): string {
  const dir = join(h.tmp, ".claude", "projects", "-work-inc");
  mkdirSync(dir, { recursive: true });
  return dir;
}

function codexDir(): string {
  const dir = join(h.tmp, ".codex", "sessions", "2026", "08", "13");
  mkdirSync(dir, { recursive: true });
  return dir;
}

function userRow(text: string): string {
  return `${L({ type: "user", sessionId: SID, cwd: "/work/inc", message: { role: "user", content: text } })}\n`;
}
function assistantRow(text: string): string {
  return `${L({ type: "assistant", sessionId: SID, message: { role: "assistant", content: [{ type: "text", text }] } })}\n`;
}

/** A run's worth of full reads (start 0/undefined, no end bound). */
function unboundedFullReads(): number {
  return reads.calls.filter((c) => !c.start && c.end === undefined).length;
}

beforeEach(() => {
  h.tmp = mkdtempSync(join(tmpdir(), "termco-inc-"));
  resetSummaryDiskCacheForTests();
  reads.calls.length = 0;
});

describe("incremental Claude summaries", () => {
  it("appending rows updates count via a DELTA read, not a full re-parse", async () => {
    const file = join(claudeDir(), `${SID}.jsonl`);
    writeFileSync(file, userRow("first prompt") + assistantRow("reply 1"));
    const first = await listAllSessions(300, h.tmp);
    expect(first).toHaveLength(1);
    expect(first[0].messageCount).toBe(2);
    expect(first[0].name).toBe("first prompt");

    reads.calls.length = 0;
    appendFileSync(file, assistantRow("reply 2") + userRow("follow-up"));
    const second = await listAllSessions(300, h.tmp);
    expect(second[0].messageCount).toBe(4);
    // Name derives from the FIRST user message — the follow-up must not win.
    expect(second[0].name).toBe("first prompt");
    // The refresh must not have re-streamed the file from byte 0 unbounded.
    expect(unboundedFullReads()).toBe(0);
  });

  it("a title row in the appended delta overrides the derived name", async () => {
    const file = join(claudeDir(), `${SID}.jsonl`);
    writeFileSync(file, userRow("first prompt") + assistantRow("reply"));
    await listAllSessions(300, h.tmp);
    appendFileSync(file, `${L({ type: "ai-title", sessionId: SID, aiTitle: "Shiny Title" })}\n`);
    const after = await listAllSessions(300, h.tmp);
    expect(after[0].name).toBe("Shiny Title");
  });

  it("a REWRITTEN transcript (different head) falls back to a full parse", async () => {
    const file = join(claudeDir(), `${SID}.jsonl`);
    writeFileSync(file, userRow("old head") + assistantRow("old reply"));
    await listAllSessions(300, h.tmp);

    // Rewrite with different content but LARGER size — only the probes can
    // tell this apart from an append.
    writeFileSync(
      file,
      userRow("rewritten head prompt, different bytes") +
        assistantRow("x") +
        assistantRow("y") +
        assistantRow("z"),
    );
    const after = await listAllSessions(300, h.tmp);
    expect(after[0].messageCount).toBe(4);
    expect(after[0].name).toBe("rewritten head prompt, different bytes");
  });

  it("a SHRUNK transcript falls back to a full parse", async () => {
    const file = join(claudeDir(), `${SID}.jsonl`);
    writeFileSync(
      file,
      userRow("first prompt") + assistantRow("r1") + assistantRow("r2"),
    );
    await listAllSessions(300, h.tmp);
    writeFileSync(file, userRow("first prompt"));
    const after = await listAllSessions(300, h.tmp);
    expect(after[0].messageCount).toBe(1);
  });

  it("a trailing partial line (CLI mid-write) is deferred to the next pass", async () => {
    const file = join(claudeDir(), `${SID}.jsonl`);
    writeFileSync(file, userRow("first prompt"));
    await listAllSessions(300, h.tmp);

    // Half a row, no newline: must not be counted yet.
    const half = assistantRow("complete later").slice(0, 25);
    appendFileSync(file, half);
    const mid = await listAllSessions(300, h.tmp);
    expect(mid[0].messageCount).toBe(1);

    // Finish the row: exactly one more message, not a double-count.
    appendFileSync(file, assistantRow("complete later").slice(25));
    const done = await listAllSessions(300, h.tmp);
    expect(done[0].messageCount).toBe(2);
  });
});

describe("incremental Codex summaries", () => {
  it("appending messages updates count via a delta read and keeps the name", async () => {
    const file = join(codexDir(), "rollout-2026-08-13T10-00-00-abc.jsonl");
    writeFileSync(
      file,
      `${L({ payload: { id: "codex-1", cwd: "/work/inc" } })}\n` +
        `${L({ payload: { type: "message", role: "user", content: "codex prompt" } })}\n`,
    );
    const first = await listCodexSessions(200, h.tmp);
    expect(first).toHaveLength(1);
    expect(first[0].messageCount).toBe(1);
    expect(first[0].name).toBe("codex prompt");

    reads.calls.length = 0;
    appendFileSync(
      file,
      `${L({ payload: { type: "message", role: "assistant", content: "answer" } })}\n`,
    );
    const second = await listCodexSessions(200, h.tmp);
    expect(second[0].messageCount).toBe(2);
    expect(second[0].name).toBe("codex prompt");
    expect(unboundedFullReads()).toBe(0);
  });
});
// Owned by the coding-agent-native provider plugin.
