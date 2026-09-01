/**
 * List remote coding-agent sessions in one SSH round trip and fetch individual
 * transcripts on demand. Listing failures throw; transcript failures become
 * normalized error events for the existing UI.
 */

import type { AgentEvent, AgentSessionSummary } from "@termco/agents-base";
import type { SshCliOutput, SshTarget, SshWorkspace } from "@termco/ssh-base";
import { codingAgentRuntime } from "./runtime";
import { codexRolloutToEvents } from "./codexBlocks";
import { readMeta as rolloutMeta } from "./codexSessions";
import { shellQuote } from "./remote";
import { slugFromCwd, transcriptToEvents } from "./sessions";

/** Byte caps: index tails + transcript reads (a partial first line is dropped
 * naturally — it fails JSON.parse). */
const CLAUDE_INDEX_CAP = 2 * 1024 * 1024;
const CODEX_INDEX_CAP = 1024 * 1024;
const TRANSCRIPT_CAP = 8 * 1024 * 1024;
/** Newest rollout heads fetched for cwd resolution. */
const ROLLOUT_HEAD_CAP = 60;

/** Section markers — chosen so login banners/MOTD noise can't collide. */
const M_CLAUDE = "==TC-CLAUDE-HISTORY";
const M_CODEX = "==TC-CODEX-HISTORY";
const M_ROLLOUTS = "==TC-CODEX-ROLLOUTS";
const M_FILE = "==TC-FILE ";
const M_FOUND = "==TC-FOUND";
const M_GONE = "==TC-GONE";

/** The one-shot listing command (pure — exported for tests). Prints the two
 * history tails plus the newest rollouts' first lines, each behind a marker.
 * Pure POSIX sh; `2>/dev/null` everywhere so a missing CLI dir is just an
 * empty section, and a trailing `true` keeps the exit code 0. */
export function buildListingCommand(): string {
  return (
    `echo "${M_CLAUDE}"; ` +
    `tail -c ${CLAUDE_INDEX_CAP} "$HOME/.claude/history.jsonl" 2>/dev/null; echo; ` +
    `echo "${M_CODEX}"; ` +
    `tail -c ${CODEX_INDEX_CAP} "$HOME/.codex/history.jsonl" 2>/dev/null; echo; ` +
    `echo "${M_ROLLOUTS}"; ` +
    `for f in $(ls -t "$HOME"/.codex/sessions/*/*/*/rollout-*.jsonl 2>/dev/null | head -n ${ROLLOUT_HEAD_CAP}); do ` +
    `printf '${M_FILE}%s\\n' "$f"; head -c 4096 "$f" 2>/dev/null | head -n 1; echo; done; ` +
    "true"
  );
}

/** Split the listing stdout back into its sections (pure). */
export function splitListing(stdout: string): {
  claudeHistory: string[];
  codexHistory: string[];
  rolloutHeads: Array<{ path: string; headLine: string }>;
} {
  const claudeHistory: string[] = [];
  const codexHistory: string[] = [];
  const rolloutHeads: Array<{ path: string; headLine: string }> = [];
  let section: "none" | "claude" | "codex" | "rollouts" = "none";
  let currentFile: { path: string; headLine: string } | null = null;
  for (const line of stdout.split("\n")) {
    if (line.startsWith(M_CLAUDE)) {
      section = "claude";
      continue;
    }
    if (line.startsWith(M_CODEX)) {
      section = "codex";
      continue;
    }
    if (line.startsWith(M_ROLLOUTS)) {
      section = "rollouts";
      continue;
    }
    if (section === "claude") claudeHistory.push(line);
    else if (section === "codex") codexHistory.push(line);
    else if (section === "rollouts") {
      if (line.startsWith(M_FILE)) {
        currentFile = { path: line.slice(M_FILE.length).trim(), headLine: "" };
        rolloutHeads.push(currentFile);
      } else if (currentFile && !currentFile.headLine && line.trim()) {
        currentFile.headLine = line;
      }
    }
  }
  return { claudeHistory, codexHistory, rolloutHeads };
}

function normalizeName(v: string): string {
  return v.replace(/\s+/g, " ").trim().slice(0, 120);
}

function baseName(p: string): string {
  const i = Math.max(p.lastIndexOf("/"), p.lastIndexOf("\\"));
  return (i >= 0 ? p.slice(i + 1) : p) || p;
}

/** Summaries from prompt-history lines. The first prompt is the title and
 * last timestamp = recency, prompt count = a message-count proxy. */
export function parseClaudeIndex(lines: string[]): AgentSessionSummary[] {
  const bySession = new Map<
    string,
    { name: string; cwd: string; updatedAt: number; count: number }
  >();
  for (const line of lines) {
    if (!line.trim()) continue;
    let o: { sessionId?: unknown; display?: unknown; project?: unknown; timestamp?: unknown };
    try {
      o = JSON.parse(line);
    } catch {
      continue; // partial first line under the byte cap, banners, …
    }
    if (typeof o.sessionId !== "string" || !o.sessionId) continue;
    const ts = typeof o.timestamp === "number" ? o.timestamp : 0;
    const prev = bySession.get(o.sessionId);
    if (prev) {
      prev.count += 1;
      if (ts > prev.updatedAt) prev.updatedAt = ts;
    } else {
      bySession.set(o.sessionId, {
        name: typeof o.display === "string" ? normalizeName(o.display) : "",
        cwd: typeof o.project === "string" ? o.project : "",
        updatedAt: ts,
        count: 1,
      });
    }
  }
  return [...bySession.entries()].map(([sessionId, s]) => ({
    sessionId,
    backend: "claude" as const,
    projectSlug: s.cwd ? slugFromCwd(s.cwd) : "",
    name: s.name || sessionId.slice(0, 8),
    cwd: s.cwd,
    projectName: baseName(s.cwd) || "Claude",
    updatedAt: s.updatedAt,
    messageCount: s.count,
  }));
}

/** Build per-session names and recency from second-based history timestamps. */
export function parseCodexHistory(
  lines: string[],
): Map<string, { name: string; updatedAt: number; count: number }> {
  const map = new Map<string, { name: string; updatedAt: number; count: number }>();
  for (const line of lines) {
    if (!line.trim()) continue;
    let o: { session_id?: unknown; ts?: unknown; text?: unknown };
    try {
      o = JSON.parse(line);
    } catch {
      continue;
    }
    if (typeof o.session_id !== "string" || !o.session_id) continue;
    const ts = typeof o.ts === "number" ? o.ts * 1000 : 0;
    const prev = map.get(o.session_id);
    if (prev) {
      prev.count += 1;
      if (ts > prev.updatedAt) prev.updatedAt = ts;
    } else {
      map.set(o.session_id, {
        name: typeof o.text === "string" ? normalizeName(o.text) : "",
        updatedAt: ts,
        count: 1,
      });
    }
  }
  return map;
}

/** Timestamp encoded in a rollout filename (`rollout-2026-08-12T21-49-56-…`),
 * as a best-effort ms epoch (host-local time treated as local — good enough
 * for ordering), or 0. */
export function rolloutFilenameTs(path: string): number {
  const m = /rollout-(\d{4})-(\d{2})-(\d{2})T(\d{2})-(\d{2})-(\d{2})/.exec(path);
  if (!m) return 0;
  const [, y, mo, d, h, mi, s] = m;
  const t = new Date(+y, +mo - 1, +d, +h, +mi, +s).getTime();
  return Number.isFinite(t) ? t : 0;
}

/** Rollout summaries: headers give session id, cwd, and path; history enriches
 * name/recency/count (pure). */
export function parseCodexIndex(
  historyLines: string[],
  heads: Array<{ path: string; headLine: string }>,
): AgentSessionSummary[] {
  const hist = parseCodexHistory(historyLines);
  const out: AgentSessionSummary[] = [];
  for (const { path, headLine } of heads) {
    if (!path.startsWith("/")) continue; // ls noise, never a rollout
    const meta = rolloutMeta([headLine]);
    const idFromName =
      /-([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\.jsonl$/i.exec(
        path,
      )?.[1] ?? "";
    const sessionId = meta.sessionId || idFromName;
    if (!sessionId) continue;
    const h = hist.get(sessionId);
    out.push({
      sessionId,
      backend: "codex",
      projectSlug: "",
      filePath: path,
      name: h?.name || "Codex session",
      cwd: meta.cwd,
      projectName: meta.cwd ? baseName(meta.cwd) : "Codex",
      updatedAt: h?.updatedAt || rolloutFilenameTs(path),
      messageCount: h?.count ?? 0,
    });
  }
  return out;
}

/** Parse the full one-shot output into summaries (pure). */
export function parseListing(stdout: string): AgentSessionSummary[] {
  const { claudeHistory, codexHistory, rolloutHeads } = splitListing(stdout);
  return [...parseClaudeIndex(claudeHistory), ...parseCodexIndex(codexHistory, rolloutHeads)].sort(
    (a, b) => b.updatedAt - a.updatedAt,
  );
}

/** Listing cache: repeated open/refresh of the browser shouldn't hammer ssh. */
const listingCache = new Map<string, { at: number; sessions: AgentSessionSummary[] }>();
const LISTING_TTL_MS = 30_000;

export function clearRemoteSessionCache(): void {
  listingCache.clear();
}

function workspace(target: SshTarget): SshWorkspace {
  return { kind: "ssh", ...target };
}

function successful(output: SshCliOutput): boolean {
  return !output.spawnError && !output.timedOut && output.exitCode === 0;
}

function destination(target: SshTarget): string {
  return codingAgentRuntime().execution.prepare<string>(workspace(target), {
    domain: "ssh",
    method: "destination",
    args: [],
  });
}

function runRemote(
  target: SshTarget,
  command: string,
  timeoutSeconds: number,
): Promise<SshCliOutput> {
  return codingAgentRuntime().execution.invoke<SshCliOutput>(workspace(target), {
    domain: "ssh",
    method: "runSsh",
    args: [target, command, timeoutSeconds],
  });
}

/** List a host's sessions (both backends) in ONE ssh round-trip, cached ~30s.
 * Throws with a user-readable message when the host is unreachable — the
 * caller must surface it, never show an empty list as success. */
export async function listRemoteSessions(target: SshTarget): Promise<AgentSessionSummary[]> {
  const cached = listingCache.get(target.connectionId);
  if (cached && Date.now() - cached.at < LISTING_TTL_MS) return cached.sessions;
  const out = await runRemote(target, buildListingCommand(), 20);
  if (!successful(out)) {
    throw new Error(
      `Host ${destination(target)} is unreachable — its sessions live there.`,
    );
  }
  const sessions = parseListing(out.stdout);
  listingCache.set(target.connectionId, { at: Date.now(), sessions });
  return sessions;
}

/** Remote path guards — these values end up inside a shell command. Slugs/ids
 * come from OUR listing, but never trust them blind. */
const SAFE_SLUG = /^[A-Za-z0-9-]+$/;
const SAFE_ABS_PATH = /^\/[^\n\r]*$/;

/** The transcript one-shot: existence-checked tail behind markers (pure). */
export function buildTranscriptCommand(opts: {
  backend: "claude" | "codex";
  projectSlug?: string;
  sessionId?: string;
  filePath?: string;
}): string | null {
  let path: string;
  if (opts.backend === "claude") {
    const slug = opts.projectSlug ?? "";
    const id = opts.sessionId ?? "";
    if (!SAFE_SLUG.test(slug) || !SAFE_SLUG.test(id)) return null;
    // $HOME must expand; slug/id are validated to be quote-free above.
    path = `"$HOME"/.claude/projects/${shellQuote(slug)}/${shellQuote(`${id}.jsonl`)}`;
  } else {
    const p = opts.filePath ?? "";
    if (!SAFE_ABS_PATH.test(p)) return null;
    path = shellQuote(p);
  }
  return `if [ -f ${path} ]; then echo "${M_FOUND}"; tail -c ${TRANSCRIPT_CAP} ${path}; else echo "${M_GONE}"; fi`;
}

/** One error block in the transcript view — honest, zero new UI plumbing. */
function errorEvents(message: string): AgentEvent[] {
  return [{ type: "error", message }];
}

/** Read a remote session transcript as normalized events. Never throws —
 * missing file / unreachable host become an error event the transcript view
 * renders as an error block. */
export async function readRemoteSessionEvents(
  target: SshTarget,
  opts: {
    backend: "claude" | "codex";
    projectSlug?: string;
    sessionId?: string;
    filePath?: string;
  },
): Promise<AgentEvent[]> {
  const cmd = buildTranscriptCommand(opts);
  if (!cmd) return errorEvents("Invalid remote session reference.");
  let out: SshCliOutput;
  try {
    out = await runRemote(target, cmd, 30);
  } catch {
    out = {
      stdout: "",
      stderr: "",
      exitCode: null,
      timedOut: false,
      truncated: false,
      spawnError: true,
    };
  }
  if (!successful(out)) {
    return errorEvents(
      `Host ${destination(target)} is unreachable — the transcript lives there.`,
    );
  }
  const idx = out.stdout.indexOf(M_FOUND);
  if (idx === -1) {
    return errorEvents(
      `This session no longer exists on ${destination(target)}.`,
    );
  }
  const lines = out.stdout
    .slice(idx + M_FOUND.length)
    .replace(/^\r?\n/, "")
    .split("\n");
  return opts.backend === "claude"
    ? transcriptToEvents(lines, opts.sessionId ?? "")
    : codexRolloutToEvents(lines);
}
// Owned by the coding-agent-native provider plugin.
