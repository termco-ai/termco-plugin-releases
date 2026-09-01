/**
 * Discover persisted rollout sessions from metadata headers. Listing is
 * tolerant and scan-on-demand; transcript reopening is best-effort.
 */

import { readdir, stat } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import type { AgentEvent, AgentSessionSummary } from "@termco/agents-base";
import { codexRolloutToEvents } from "./codexBlocks";
import {
  buildIncState,
  type IncState,
  incrementalSummariesEnabled,
  probesMatch,
  readLinesStreaming,
} from "./sessions";
import { readLineRange } from "./lineReader";
import {
  scheduleSummaryCacheSave,
  summaryCache,
  summaryCacheReady,
} from "./summaryDiskCache";

/** See sessions.ts — parsed-summary cache keyed by `path` → { mtime, summary }
 * so repeated history scans (every rig switch) don't re-parse the main thread
 * into a freeze. mtime change = cache miss = re-parse. Disk-backed via
 * summaryDiskCache (survives restarts; RAM-only in tests). */
const codexSummaryCache = summaryCache("codex");

function sessionsRoot(home = homedir()): string {
  return join(home, ".codex", "sessions");
}

function baseName(p: string): string {
  const i = Math.max(p.lastIndexOf("/"), p.lastIndexOf("\\"));
  return (i >= 0 ? p.slice(i + 1) : p) || p;
}

/** Recursively collect rollout files under a dir (bounded depth). Async so the
 * directory walk yields to the main-process event loop. */
async function collectRollouts(
  dir: string,
  depth = 5,
  acc: string[] = [],
): Promise<string[]> {
  if (depth < 0) return acc;
  let entries: import("node:fs").Dirent[];
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return acc;
  }
  for (const e of entries) {
    const full = join(dir, e.name);
    if (e.isDirectory()) await collectRollouts(full, depth - 1, acc);
    else if (e.isFile() && e.name.endsWith(".jsonl")) acc.push(full);
  }
  return acc;
}

/** Pull cwd/session-id from a rollout's `session_meta` (first matching line).
 * Exported for the remote listing, which reads only rollout HEAD lines. */
export function readMeta(lines: string[]): { sessionId: string; cwd: string } {
  for (const line of lines.slice(0, 5)) {
    if (!line.trim()) continue;
    try {
      const o = JSON.parse(line);
      const p = (o.payload ?? o) as Record<string, unknown>;
      const id = p.id ?? p.session_id;
      const cwd = p.cwd ?? p.working_directory;
      if (typeof id === "string" || typeof cwd === "string") {
        return {
          sessionId: typeof id === "string" ? id : "",
          cwd: typeof cwd === "string" ? cwd : "",
        };
      }
    } catch {
      /* skip */
    }
  }
  return { sessionId: "", cwd: "" };
}

/** First user message text + a cheap message count. Yields periodically so a
 * huge rollout can't produce one long synchronous parse block. */
export async function readNameAndCount(
  lines: string[],
): Promise<{ name: string; count: number }> {
  let name = "";
  let count = 0;
  let i = 0;
  for (const line of lines) {
    if (++i % 500 === 0) await new Promise<void>((r) => setImmediate(r));
    if (!line.trim()) continue;
    if (line.length > 64 * 1024) {
      // Giant rollout rows (big tool payloads): JSON.parsing one whole is a
      // measured main-thread block. The `type`/`role` keys live in the head —
      // probe them; the display name comes from a later, small user row.
      const head = line.slice(0, 4096);
      if (
        /"type"\s*:\s*"message"/.test(head) &&
        /"role"\s*:\s*"(user|assistant)"/.test(head)
      ) {
        count++;
      }
      continue;
    }
    try {
      const o = JSON.parse(line);
      const p = (o.payload ?? o) as Record<string, unknown>;
      const type = p.type ?? o.type;
      const role = p.role;
      if (type === "message" && (role === "user" || role === "assistant")) {
        count++;
        if (!name && role === "user") {
          const c = p.content;
          const text =
            typeof c === "string"
              ? c
              : Array.isArray(c)
                ? c
                    .map((x) =>
                      x && typeof x === "object" && typeof (x as { text?: unknown }).text === "string"
                        ? (x as { text: string }).text
                        : "",
                    )
                    .join("")
                : "";
          if (text.trim() && !text.trimStart().startsWith("<")) {
            name = text.replace(/\s+/g, " ").trim().slice(0, 120);
          }
        }
      }
    } catch {
      /* skip */
    }
  }
  return { name, count };
}

/** List rollout sessions across all projects, newest first and total-capped. Async and
 * mtime-cached so it never blocks the main-process main thread. */
export async function listCodexSessions(
  capTotal = 200,
  home = homedir(),
): Promise<AgentSessionSummary[]> {
  await summaryCacheReady();
  const files = await collectRollouts(sessionsRoot(home));
  const stats = await Promise.all(
    files.map(async (path) => {
      try {
        const s = await stat(path);
        return { path, mtime: s.mtimeMs, size: s.size };
      } catch {
        return null;
      }
    }),
  );
  const recent = stats
    .filter(
      (x): x is { path: string; mtime: number; size: number } => x !== null,
    )
    .sort((a, b) => b.mtime - a.mtime)
    .slice(0, capTotal);

  const out: AgentSessionSummary[] = [];
  for (const { path, mtime, size } of recent) {
    const cached = codexSummaryCache.get(path);
    if (cached && cached.mtime === mtime) {
      out.push(cached.summary);
      continue;
    }

    // GROWN rollout with intact probes → parse only the appended bytes (the
    // live-update hot path; see sessions.ts for the full rationale). The name
    // is the FIRST user message, so an already-named session never re-derives.
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
        const delta = await readNameAndCount(lines);
        const named = inc.nameSource === "user" || delta.name.length > 0;
        const summary: AgentSessionSummary = {
          ...cached.summary,
          name:
            inc.nameSource === "user"
              ? cached.summary.name
              : delta.name || cached.summary.name,
          updatedAt: mtime,
          messageCount: cached.summary.messageCount + delta.count,
        };
        codexSummaryCache.set(path, {
          mtime,
          summary,
          inc: {
            ...(await buildIncState(
              path,
              parsedBytes,
              undefined,
              named ? "user" : "id",
            )),
            headProbe: inc.headProbe,
          },
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
    const { sessionId, cwd } = readMeta(lines);
    const { name, count } = await readNameAndCount(lines);
    const summary: AgentSessionSummary = {
      sessionId: sessionId || baseName(path).replace(/\.jsonl$/, ""),
      backend: "codex",
      projectSlug: "",
      filePath: path,
      name: name || "Codex session",
      cwd,
      projectName: cwd ? baseName(cwd) : "Codex",
      updatedAt: mtime,
      messageCount: count,
    };
    codexSummaryCache.set(path, {
      mtime,
      summary,
      inc: await buildIncState(path, parsedBytes, lines[0], name ? "user" : "id"),
    });
    out.push(summary);
  }
  scheduleSummaryCacheSave();
  return out;
}

/** Read a rollout transcript as normalized events, best-effort. */
export async function readCodexSessionEvents(
  filePath: string,
): Promise<AgentEvent[]> {
  try {
    return codexRolloutToEvents(await readLinesStreaming(filePath));
  } catch {
    return [];
  }
}
// Owned by the coding-agent-native provider plugin.
