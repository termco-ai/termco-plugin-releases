/** Full-text search across the normalized messages in saved transcripts. */

import type {
  AgentBackend,
  AgentEvent,
  AgentSessionSearchMatch,
  AgentSessionSearchResult,
  AgentSessionSummary,
} from "@termco/agents-base";
import { listCodexSessions, readCodexSessionEvents } from "./codexSessions";
import { listAllSessions, readSessionEvents } from "./sessions";

/** Chars kept on each side of the first hit → a ~150-char one-line snippet. */
const SNIPPET_RADIUS = 64;
/** Snippets returned per session (a session can match many times). */
const MAX_MATCHES_PER_SESSION = 3;
/** Overall result cap so a broad query can't scan-and-return unbounded. */
const MAX_RESULTS = 60;
/** Ignore trivially short queries (too many hits, no signal). */
const MIN_QUERY_LEN = 2;

/** A conversation message reduced to what search cares about. */
export type SearchMessage = { role: "user" | "assistant"; text: string };

/** Reduce a normalized event stream to the human/assistant TEXT messages
 * (drops tools, reasoning, and lifecycle events). Transcript files emit
 * complete `text`/`user-message` events, so no delta merging is needed. */
export function messagesFromEvents(events: AgentEvent[]): SearchMessage[] {
  const out: SearchMessage[] = [];
  for (const e of events) {
    if (e.type === "user-message") out.push({ role: "user", text: e.text });
    else if (e.type === "text") out.push({ role: "assistant", text: e.text });
  }
  return out;
}

/** All case-insensitive [start,end) occurrences of `query` in `text`. */
export function findHighlights(
  text: string,
  query: string,
): Array<{ start: number; end: number }> {
  const needle = query.toLowerCase();
  if (!needle) return [];
  const hay = text.toLowerCase();
  const out: Array<{ start: number; end: number }> = [];
  let i = hay.indexOf(needle);
  while (i !== -1) {
    out.push({ start: i, end: i + needle.length });
    if (out.length >= 500) break; // pathological repeat guard
    i = hay.indexOf(needle, i + needle.length);
  }
  return out;
}

/** Build a compact one-line snippet around the first hit, with the highlight
 * offsets rebased into the snippet. Newlines/tabs are flattened to single
 * spaces (1:1, so offsets are preserved) and cut edges get an ellipsis. */
export function snippetAround(
  text: string,
  highlights: Array<{ start: number; end: number }>,
  radius = SNIPPET_RADIUS,
): { snippet: string; highlights: Array<{ start: number; end: number }> } | null {
  if (highlights.length === 0) return null;
  const first = highlights[0];
  const from = Math.max(0, first.start - radius);
  const to = Math.min(text.length, first.end + radius);
  const prefix = from > 0 ? "…" : "";
  const suffix = to < text.length ? "…" : "";
  const body = text.slice(from, to).replace(/[\r\n\t]/g, " ");
  const shift = prefix.length - from;
  const rel = highlights
    .filter((h) => h.start >= from && h.end <= to)
    .map((h) => ({ start: h.start + shift, end: h.end + shift }));
  return { snippet: prefix + body + suffix, highlights: rel };
}

/** Search one transcript's events: representative snippet matches + a total. */
export function searchTranscript(
  events: AgentEvent[],
  query: string,
  cap = MAX_MATCHES_PER_SESSION,
): { matches: AgentSessionSearchMatch[]; total: number } {
  const matches: AgentSessionSearchMatch[] = [];
  let total = 0;
  for (const m of messagesFromEvents(events)) {
    const hl = findHighlights(m.text, query);
    if (hl.length === 0) continue;
    total += hl.length;
    if (matches.length < cap) {
      const snip = snippetAround(m.text, hl);
      if (snip) {
        matches.push({
          role: m.role,
          snippet: snip.snippet,
          highlights: snip.highlights,
        });
      }
    }
  }
  return { matches, total };
}

/** Read a session's transcript events (routed by backend). */
function eventsFor(summary: AgentSessionSummary): Promise<AgentEvent[]> {
  return summary.backend === "codex"
    ? readCodexSessionEvents(summary.filePath ?? "")
    : readSessionEvents(summary.projectSlug, summary.sessionId);
}

/**
 * Full-text search across saved sessions. `backend` narrows the scan; omit to
 * search both. Returns sessions with at least one hit, newest first, capped.
 */
export async function searchSessions(
  query: string,
  backend?: AgentBackend,
): Promise<AgentSessionSearchResult[]> {
  const q = query.trim();
  if (q.length < MIN_QUERY_LEN) return [];

  const summaries: AgentSessionSummary[] = [
    ...(backend === "codex" ? [] : await listAllSessions()),
    ...(backend === "claude" ? [] : await listCodexSessions()),
  ].sort((a, b) => b.updatedAt - a.updatedAt);

  const results: AgentSessionSearchResult[] = [];
  for (const summary of summaries) {
    if (results.length >= MAX_RESULTS) break;
    const { matches, total } = searchTranscript(await eventsFor(summary), q);
    if (total > 0) results.push({ summary, matches, totalMatches: total });
  }
  return results;
}
// Owned by the coding-agent-native provider plugin.
