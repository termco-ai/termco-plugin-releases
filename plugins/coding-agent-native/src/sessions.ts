/**
 * Discover, summarize, and reopen persisted coding-agent transcripts. Title
 * metadata wins over the first user message, and subagent duplicates are
 * skipped. Parsing is shared with live runs for consistent rendering.
 */

import { createReadStream } from "node:fs";
import { readdir, readFile, stat } from "node:fs/promises";
import { homedir } from "node:os";
import { join, sep } from "node:path";
import type { AgentEvent, AgentSessionSummary } from "@termco/agents-base";
import { readLineRange } from "./lineReader";
import { assistantEvents, contentArray, userEvents } from "./claudeBlocks";
import {
  scheduleSummaryCacheSave,
  summaryCache as sharedSummaryCache,
  summaryCacheReady,
} from "./summaryDiskCache";

/**
 * Parsed-summary cache keyed by `path` → { mtime, summary }. The history scan
 * runs on the MAIN process (every IPC handler does), and re-scanning unchanged
 * transcripts on every rig switch used to re-parse megabytes of JSONL on the
 * main thread — a multi-second freeze (macOS beachball). A transcript's mtime
 * changes whenever it is appended/rewritten, so caching by mtime is safe: a
 * changed file misses the cache and re-parses; an unchanged one is instant.
 * Backed by summaryDiskCache so it survives app restarts (kills the cold-scan
 * CPU spike); RAM-only when persistence isn't wired (tests).
 */
const summaryCache = sharedSummaryCache("claude");

/** Yield cadence for per-line parse loops (see listSessionsInDir). */
export const PARSE_YIELD_EVERY = 500;
export const yieldLoop = () =>
  new Promise<void>((r) => {
    setImmediate(r);
  });

/** A transcript row bigger than this (multi-MB base64 tool results…) is never
 * JSON.parsed whole during the SCAN — one parse of such a line was measured as
 * a ~300ms main-thread block that per-line yielding can't split. The metadata
 * the scan needs (`type`, `isMeta`, `cwd`) sits in the row's first bytes, so a
 * head-slice probe answers it without materializing the giant object. */
const HUGE_LINE = 64 * 1024;
const HEAD_PROBE = 4096;

/** Read a file as lines via a STREAM. `readFile` + `.split("\n")` on a 100MB
 * transcript is one ~200ms+ synchronous block; streaming splits per 1MB chunk
 * with event-loop yields in between. */
export async function readLinesStreaming(path: string): Promise<string[]> {
  const lines: string[] = [];
  const stream = createReadStream(path, {
    encoding: "utf8",
    highWaterMark: 1 << 20,
  });
  let rest = "";
  for await (const chunk of stream) {
    const parts = (rest + (chunk as string)).split("\n");
    rest = parts.pop() ?? "";
    for (const p of parts) lines.push(p);
  }
  if (rest) lines.push(rest);
  return lines;
}

/** Read `length` raw bytes at `start` (for the identity probes below). */
async function probeBytes(
  path: string,
  start: number,
  length: number,
): Promise<Buffer> {
  if (length <= 0) return Buffer.alloc(0);
  const stream = createReadStream(path, {
    start,
    end: start + length - 1,
  });
  const chunks: Buffer[] = [];
  for await (const chunk of stream as AsyncIterable<Buffer>) chunks.push(chunk);
  return Buffer.concat(chunks);
}

/** Where a summary's display name came from — orders override precedence for
 * incremental updates (explicit title rows beat the history-map fallback,
 * which beats the first user message, which beats the id stub). */
export type NameSource = "explicit" | "map" | "user" | "id";

/** Incremental-parse state stored next to a cached summary. */
export type IncState = {
  parsedBytes: number;
  /** base64 of the file's first ≤64 bytes — a mismatch means the transcript
   * was rewritten (fork/compaction), so the delta path is invalid. */
  headProbe: string;
  /** base64 of the ≤32 bytes just before `parsedBytes` — catches rewrites
   * that keep the header but change the middle of the file. */
  tailProbe: string;
  nameSource: NameSource;
};

const HEAD_PROBE_BYTES = 64;
const TAIL_PROBE_BYTES = 32;

/** Kill-switch: TERMCO_NO_INC_SUMMARIES=1 forces the pre-incremental full
 * re-parse path (operational fallback + before/after benchmarking). */
export function incrementalSummariesEnabled(): boolean {
  return process.env.TERMCO_NO_INC_SUMMARIES !== "1";
}

export async function probesMatch(
  path: string,
  inc: IncState,
): Promise<boolean> {
  const head = Buffer.from(inc.headProbe, "base64");
  const tail = Buffer.from(inc.tailProbe, "base64");
  const gotHead = await probeBytes(path, 0, head.length);
  if (!gotHead.equals(head)) return false;
  const tailStart = Math.max(0, inc.parsedBytes - tail.length);
  const gotTail = await probeBytes(path, tailStart, tail.length);
  return gotTail.equals(tail);
}

export async function buildIncState(
  path: string,
  parsedBytes: number,
  firstLine: string | undefined,
  nameSource: NameSource,
): Promise<IncState> {
  const headProbe = firstLine
    ? Buffer.from(firstLine, "utf8").subarray(0, HEAD_PROBE_BYTES)
    : Buffer.alloc(0);
  const tailStart = Math.max(0, parsedBytes - TAIL_PROBE_BYTES);
  const tailProbe = await probeBytes(path, tailStart, parsedBytes - tailStart);
  return {
    parsedBytes,
    headProbe: headProbe.toString("base64"),
    tailProbe: tailProbe.toString("base64"),
    nameSource,
  };
}

/**
 * Fold a batch of (new) transcript lines into count/cwd/name. Shared by the
 * incremental delta path; mirrors exactly what the full scan counts.
 */
async function applyLines(
  lines: string[],
  sessionId: string,
  acc: { messageCount: number; cwd: string; name: string; nameSource: NameSource },
): Promise<void> {
  let i = 0;
  for (const line of lines) {
    if (++i % PARSE_YIELD_EVERY === 0) await yieldLoop();
    if (!line.trim()) continue;
    if (line.length > HUGE_LINE) {
      const p = probeHead(line);
      if (!acc.cwd && p.cwd) acc.cwd = p.cwd;
      if (p.isAssistant || (p.isUser && !p.isMeta)) acc.messageCount++;
      continue;
    }
    try {
      const o = JSON.parse(line);
      if (!acc.cwd && typeof o.cwd === "string") acc.cwd = o.cwd;
      if (o.type === "assistant" || (o.type === "user" && !o.isMeta)) {
        acc.messageCount++;
      }
      if (o.sessionId && o.sessionId !== sessionId) continue;
      if (o.type === "ai-title" && o.aiTitle?.trim()) {
        acc.name = normalizeName(o.aiTitle);
        acc.nameSource = "explicit";
      } else if (o.type === "custom-title" && o.customTitle?.trim()) {
        acc.name = normalizeName(o.customTitle);
        acc.nameSource = "explicit";
      } else if (o.type === "last-prompt" && o.lastPrompt?.trim()) {
        acc.name = normalizeName(o.lastPrompt);
        acc.nameSource = "explicit";
      } else if (
        acc.nameSource === "id" &&
        o.type === "user" &&
        !o.isMeta
      ) {
        const evs = userEvents(o.message?.content ?? o.content);
        const first = evs.find((e) => e.type === "user-message");
        if (first && first.type === "user-message" && first.text.trim()) {
          acc.name = normalizeName(first.text);
          acc.nameSource = "user";
        }
      }
    } catch {
      /* skip */
    }
  }
}

function probeHead(line: string): {
  isAssistant: boolean;
  isUser: boolean;
  isMeta: boolean;
  cwd: string;
} {
  const head = line.slice(0, HEAD_PROBE);
  let cwd = "";
  const m = head.match(/"cwd"\s*:\s*"((?:[^"\\]|\\.)*)"/);
  if (m) {
    try {
      cwd = JSON.parse(`"${m[1]}"`) as string;
    } catch {
      /* keep "" */
    }
  }
  return {
    isAssistant: /"type"\s*:\s*"assistant"/.test(head),
    isUser: /"type"\s*:\s*"user"/.test(head),
    isMeta: /"isMeta"\s*:\s*true/.test(head),
    cwd,
  };
}

/** Encode a cwd as a project-directory slug. */
export function slugFromCwd(cwd: string): string {
  return cwd.replace(/[^a-zA-Z0-9]/g, "-");
}

function projectsDir(home = homedir()): string {
  return join(home, ".claude", "projects");
}

/** mtime-keyed cache for the parsed history.jsonl name map — the file is
 * hundreds of KB and was re-parsed on EVERY list refresh (i.e. every watcher
 * event while the history view is open), a fixed ~10-20ms CPU tax per event. */
let nameMapCache: { mtime: number; map: Map<string, string> } | null = null;

/** Read a `history.jsonl`-style name map (sessionId → display), best-effort. */
async function historyNameMap(home = homedir()): Promise<Map<string, string>> {
  const path = join(home, ".claude", "history.jsonl");
  let mtime = 0;
  try {
    mtime = (await stat(path)).mtimeMs;
  } catch {
    return new Map();
  }
  if (nameMapCache && nameMapCache.mtime === mtime) return nameMapCache.map;
  const map = new Map<string, string>();
  try {
    const raw = await readFile(path, "utf8");
    let i = 0;
    for (const line of raw.split("\n")) {
      // history.jsonl grows with every session — chunk the parse so it can't
      // become one long synchronous block on the main thread.
      if (++i % PARSE_YIELD_EVERY === 0) await yieldLoop();
      if (!line.trim()) continue;
      try {
        const o = JSON.parse(line);
        if (o.sessionId && typeof o.display === "string") map.set(o.sessionId, o.display);
      } catch {
        /* skip */
      }
    }
  } catch {
    /* no history file */
  }
  nameMapCache = { mtime, map };
  return map;
}

function normalizeName(v: string): string {
  return v.replace(/\s+/g, " ").trim().slice(0, 120);
}

/** Title for a session: ai-title/last-prompt/custom-title (from the end), else
 * the first human user message, else the session id. Also reports WHERE the
 * name came from so the incremental delta path knows what may override it. */
async function deriveName(
  lines: string[],
  sessionId: string,
  fallback?: string,
): Promise<{ name: string; source: NameSource }> {
  for (let i = lines.length - 1; i >= 0; i--) {
    if ((lines.length - i) % PARSE_YIELD_EVERY === 0) await yieldLoop();
    const line = lines[i];
    if (!line.trim()) continue;
    // Title rows (ai-title/custom-title/last-prompt) are tiny — a giant row
    // can't be one, and parsing it whole is a main-thread block. Skip.
    if (line.length > HUGE_LINE) continue;
    try {
      const o = JSON.parse(line);
      if (o.sessionId && o.sessionId !== sessionId) continue;
      if (o.type === "ai-title" && o.aiTitle?.trim()) {
        return { name: normalizeName(o.aiTitle), source: "explicit" };
      }
      if (o.type === "custom-title" && o.customTitle?.trim()) {
        return { name: normalizeName(o.customTitle), source: "explicit" };
      }
      if (o.type === "last-prompt" && o.lastPrompt?.trim()) {
        return { name: normalizeName(o.lastPrompt), source: "explicit" };
      }
    } catch {
      /* skip */
    }
  }
  if (fallback) return { name: normalizeName(fallback), source: "map" };
  // First human user text.
  for (const line of lines) {
    if (line.length > HUGE_LINE) continue; // see above — never parse whole
    try {
      const o = JSON.parse(line);
      if (o.type === "user" && !o.isMeta) {
        const evs = userEvents(o.message?.content ?? o.content);
        const first = evs.find((e) => e.type === "user-message");
        if (first && first.type === "user-message") {
          return { name: normalizeName(first.text), source: "user" };
        }
      }
    } catch {
      /* skip */
    }
  }
  return { name: sessionId.slice(0, 8), source: "id" };
}

/** basename of a path (unix/windows separators). */
function baseName(p: string): string {
  const i = Math.max(p.lastIndexOf("/"), p.lastIndexOf("\\"));
  return (i >= 0 ? p.slice(i + 1) : p) || p;
}

/** Parse one project dir's sessions, newest files first, capped so a huge
 * project can't blow up an on-demand scan. `names` is the shared history map. */
async function listSessionsInDir(
  slug: string,
  names: Map<string, string>,
  capFiles = 40,
  root = projectsDir(),
): Promise<AgentSessionSummary[]> {
  const dir = join(root, slug);
  let files: string[];
  try {
    files = (await readdir(dir)).filter(
      (f) => f.endsWith(".jsonl") && !f.startsWith("agent-"),
    );
  } catch {
    return [];
  }
  // Stat once to order by recency + cap. `await` between stats keeps the main
  // thread free (the whole scan runs on the main process).
  const stats = await Promise.all(
    files.map(async (file) => {
      try {
        const s = await stat(join(dir, file));
        return { file, mtime: s.mtimeMs, size: s.size };
      } catch {
        return null;
      }
    }),
  );
  const recent = stats
    .filter((x): x is { file: string; mtime: number; size: number } => x !== null)
    .sort((a, b) => b.mtime - a.mtime)
    .slice(0, capFiles);

  const out: AgentSessionSummary[] = [];
  for (const { file, mtime, size } of recent) {
    const path = join(dir, file);
    if (path.split(sep).includes("subagents")) continue;
    // Unchanged transcript → reuse the parsed summary (no re-parse, no block).
    const cached = summaryCache.get(path);
    if (cached && cached.mtime === mtime) {
      out.push(cached.summary);
      continue;
    }
    const sessionId = file.replace(/\.jsonl$/, "");

    // GROWN transcript with intact identity probes → parse only the appended
    // bytes. This is the live-CLI hot path: a streaming run rewrites its
    // transcript's mtime every few hundred ms, and the full re-parse of an
    // ever-growing multi-MB file on every watcher event was a sustained CPU
    // burn (~100ms per 30MB, at ~1Hz) while the history/roster was open.
    const inc = cached?.inc as IncState | undefined;
    if (
      incrementalSummariesEnabled() &&
      cached &&
      inc &&
      typeof inc.parsedBytes === "number" &&
      size >= inc.parsedBytes &&
      (await probesMatch(path, inc).catch(() => false))
    ) {
      try {
        const { lines, parsedBytes } = await readLineRange(
          path,
          inc.parsedBytes,
        );
        const acc = {
          messageCount: cached.summary.messageCount,
          cwd: cached.summary.cwd,
          name: cached.summary.name,
          nameSource: inc.nameSource ?? "explicit",
        };
        await applyLines(lines, sessionId, acc);
        const summary: AgentSessionSummary = {
          ...cached.summary,
          name: acc.name,
          cwd: acc.cwd,
          projectName: baseName(acc.cwd) || slug,
          updatedAt: mtime,
          messageCount: acc.messageCount,
        };
        summaryCache.set(path, {
          mtime,
          summary,
          inc: await buildIncState(path, parsedBytes, undefined, acc.nameSource).then(
            (s) => ({ ...s, headProbe: inc.headProbe }),
          ),
        });
        out.push(summary);
        continue;
      } catch {
        /* fall through to the full parse */
      }
    }

    let lines: string[];
    let parsedBytes = 0;
    try {
      ({ lines, parsedBytes } = await readLineRange(path));
    } catch {
      continue;
    }
    const acc = {
      messageCount: 0,
      cwd: "",
      name: "",
      nameSource: "id" as NameSource,
    };
    // Count/cwd pass (mirrors applyLines, without the title state machine —
    // titles keep their end-of-file precedence via deriveName below).
    let i = 0;
    for (const line of lines) {
      // A huge transcript's parse loop is otherwise one long synchronous block
      // in local measurements, so yield periodically to ensure the
      // first-ever scan never blocks the main thread noticeably.
      if (++i % PARSE_YIELD_EVERY === 0) await yieldLoop();
      if (!line.trim()) continue;
      if (line.length > HUGE_LINE) {
        const p = probeHead(line);
        if (!acc.cwd && p.cwd) acc.cwd = p.cwd;
        if (p.isAssistant || (p.isUser && !p.isMeta)) acc.messageCount++;
        continue;
      }
      try {
        const o = JSON.parse(line);
        if (!acc.cwd && typeof o.cwd === "string") acc.cwd = o.cwd;
        if (o.type === "assistant" || (o.type === "user" && !o.isMeta)) acc.messageCount++;
      } catch {
        /* skip */
      }
    }
    const derived = await deriveName(lines, sessionId, names.get(sessionId));
    const summary: AgentSessionSummary = {
      sessionId,
      backend: "claude",
      projectSlug: slug,
      name: derived.name,
      cwd: acc.cwd,
      projectName: baseName(acc.cwd) || slug,
      updatedAt: mtime,
      messageCount: acc.messageCount,
    };
    summaryCache.set(path, {
      mtime,
      summary,
      inc: await buildIncState(path, parsedBytes, lines[0], derived.source),
    });
    out.push(summary);
  }
  return out;
}

/** List sessions for a cwd (or explicit slug), newest first. */
export async function listSessions(
  cwdOrSlug: string,
): Promise<AgentSessionSummary[]> {
  await summaryCacheReady();
  const slug = cwdOrSlug.includes(sep) ? slugFromCwd(cwdOrSlug) : cwdOrSlug;
  const out = (await listSessionsInDir(slug, await historyNameMap())).sort(
    (a, b) => b.updatedAt - a.updatedAt,
  );
  scheduleSummaryCacheSave();
  return out;
}

/** List sessions across all projects,
 * newest first, total-capped. The "complete history" scan. Async + yields per
 * project so it never blocks the main-process main thread. */
export async function listAllSessions(
  capTotal = 300,
  home = homedir(),
): Promise<AgentSessionSummary[]> {
  await summaryCacheReady();
  const root = projectsDir(home);
  let slugs: string[];
  try {
    slugs = await readdir(root);
  } catch {
    return [];
  }
  const names = await historyNameMap(home);
  const out: AgentSessionSummary[] = [];
  for (const slug of slugs) {
    try {
      if (!(await stat(join(root, slug))).isDirectory()) continue;
    } catch {
      continue;
    }
    out.push(...(await listSessionsInDir(slug, names, 40, root)));
  }
  scheduleSummaryCacheSave();
  return out.sort((a, b) => b.updatedAt - a.updatedAt).slice(0, capTotal);
}

/** One transcript row → its normalized events (shared by sync + chunked). */
function lineToEvents(line: string, sessionId: string): AgentEvent[] {
  if (!line.trim()) return [];
  let o: Record<string, unknown>;
  try {
    o = JSON.parse(line) as Record<string, unknown>;
  } catch {
    return [];
  }
  // Only this session's rows (a resumed/forked file can carry others).
  if (o.sessionId && o.sessionId !== sessionId) return [];
  if (o.type === "assistant") {
    return assistantEvents(contentArray(o));
  }
  if (o.type === "user" && o.isMeta !== true) {
    const message = o.message as Record<string, unknown> | undefined;
    return userEvents(message?.content ?? o.content);
  }
  return [];
}

/** Pure: transcript lines → normalized events (folded by the reducer). */
export function transcriptToEvents(lines: string[], sessionId: string): AgentEvent[] {
  const events: AgentEvent[] = [];
  for (const line of lines) events.push(...lineToEvents(line, sessionId));
  return events;
}

/** Parse a session transcript file into normalized events. Streamed + chunked:
 * a 100MB transcript used to be one readFileSync+split+parse freeze on OPEN. */
export async function readSessionEvents(
  projectSlug: string,
  sessionId: string,
): Promise<AgentEvent[]> {
  const path = join(projectsDir(), projectSlug, `${sessionId}.jsonl`);
  let lines: string[];
  try {
    lines = await readLinesStreaming(path);
  } catch {
    return [];
  }
  const events: AgentEvent[] = [];
  let i = 0;
  for (const line of lines) {
    if (++i % PARSE_YIELD_EVERY === 0) await yieldLoop();
    events.push(...lineToEvents(line, sessionId));
  }
  return events;
}
// Owned by the coding-agent-native provider plugin.
