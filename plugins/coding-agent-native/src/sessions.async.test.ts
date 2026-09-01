/**
 * The history scan runs on the Electron MAIN process (every IPC handler does).
 * It used to be fully synchronous (`readdirSync`/`statSync`/`readFileSync` +
 * `JSON.parse` of every line of up to 300 transcripts), which froze the main
 * thread for seconds on agent-panel open / rig switch — the macOS beachball
 * Kevin reproduced. These tests prove the scan is now async (yields to the event
 * loop mid-scan → main thread stays free) and mtime-cached (a repeated switch
 * doesn't re-parse unchanged transcripts).
 */
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({ tmp: "" }));
vi.mock("node:os", async (orig) => {
  const actual = await orig<typeof import("node:os")>();
  return { ...actual, homedir: () => h.tmp };
});

// Imported AFTER the mock so `homedir()` inside resolves to our temp home.
const { listAllSessions } = await import("./sessions");

const L = (o: unknown) => JSON.stringify(o);

/** A representative transcript with a cwd line and several messages. */
function transcript(sessionId: string, cwd: string, firstPrompt: string): string {
  const lines = [
    L({ type: "user", sessionId, cwd, message: { role: "user", content: firstPrompt } }),
  ];
  // Pad so each file is non-trivial to parse (exercises the async read/parse).
  for (let i = 0; i < 60; i++) {
    lines.push(
      L({ type: "assistant", sessionId, message: { role: "assistant", content: [{ type: "text", text: `reply ${i} `.repeat(20) }] } }),
      L({ type: "user", sessionId, message: { role: "user", content: `msg ${i}` } }),
    );
  }
  return `${lines.join("\n")}\n`;
}

const PROJECTS = 24;
const SESSIONS_PER = 2;

beforeAll(() => {
  h.tmp = mkdtempSync(join(tmpdir(), "termco-sessions-"));
  const projectsDir = join(h.tmp, ".claude", "projects");
  for (let p = 0; p < PROJECTS; p++) {
    const cwd = `/work/project-${p}`;
    const slug = cwd.replace(/[^a-zA-Z0-9]/g, "-");
    const dir = join(projectsDir, slug);
    mkdirSync(dir, { recursive: true });
    for (let s = 0; s < SESSIONS_PER; s++) {
      const id = `sess-${p}-${s}`;
      writeFileSync(join(dir, `${id}.jsonl`), transcript(id, cwd, `Task ${p}.${s}`));
    }
  }
});

afterAll(() => {
  vi.restoreAllMocks();
});

describe("listAllSessions (async history scan)", () => {
  it("scans every project and returns sessions newest-first", async () => {
    const sessions = await listAllSessions(300, h.tmp);
    expect(sessions.length).toBe(PROJECTS * SESSIONS_PER);
    // Names derive from the first human prompt.
    expect(sessions.some((s) => s.name === "Task 0.0")).toBe(true);
    // Sorted by updatedAt descending.
    for (let i = 1; i < sessions.length; i++) {
      expect(sessions[i - 1].updatedAt).toBeGreaterThanOrEqual(sessions[i].updatedAt);
    }
  });

  it("YIELDS to the event loop during the scan (main thread stays free)", async () => {
    // A 0ms interval can only tick between event-loop turns. A synchronous scan
    // would hog the thread and keep this at 0; the async scan awaits many times
    // (readdir + per-file stat/read across 48 files), so the timer fires.
    let ticks = 0;
    const timer = setInterval(() => {
      ticks++;
    }, 0);
    try {
      await listAllSessions(300, h.tmp);
    } finally {
      clearInterval(timer);
    }
    expect(ticks).toBeGreaterThan(0);
  });

  it("mtime-caches parsed summaries: a repeated scan reuses objects, no re-parse", async () => {
    // Same files, unchanged mtime → the second scan must return the SAME summary
    // object instances (served from cache), proving no re-read/re-parse happened.
    const first = await listAllSessions(300, h.tmp);
    const second = await listAllSessions(300, h.tmp);
    const firstById = new Map(first.map((s) => [s.sessionId, s]));
    let reused = 0;
    for (const s of second) {
      if (firstById.get(s.sessionId) === s) reused++;
    }
    expect(reused).toBe(second.length);
  });
});
// Owned by the coding-agent-native provider plugin.
