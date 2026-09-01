/** Source-owned by the coding-agent-native plugin.
 * The history browser shows cross-backend session history across all projects,
 * grouped by project,
 * newest first. Opening one folds its saved transcript into a read-only detail
 * view. This is the "history of your agent talks".
 */

import { CODING_AGENT_EVENTS } from "@termco/agents-base";
import ui from "@termco/ui";
import {
  ArrowLeft01Icon,
  ArrowRight01Icon,
  Cancel01Icon,
  Clock01Icon,
  Message01Icon,
  Search01Icon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { type ReactNode, useEffect, useMemo, useRef, useState } from "react";
import { searchSessions as searchSessionsIpc } from "../lib/client";
import type {
  AgentBackend,
  AgentSessionSearchMatch,
  AgentSessionSearchResult,
  AgentSessionSummary,
  AgentWorkspace,
} from "../lib/protocol";
import { useCodingAgentsStore } from "../store/codingAgentsStore";
import { BackendAvatar, backendMeta } from "./backendMeta";
import { codingAgentUiRuntime } from "../runtime";

const {
  Button,
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
  cn,
} = ui;

function basename(p: string): string {
  const i = Math.max(p.lastIndexOf("/"), p.lastIndexOf("\\"));
  return (i >= 0 ? p.slice(i + 1) : p) || p;
}

/** Resolve a saved backend session to its current-format adapter session. */
async function openTrajectoryForSummary(
  summary: AgentSessionSummary,
  openSession: (sessionId: string) => void,
): Promise<void> {
  const query = codingAgentUiRuntime().query;
  if (!query) return;
  try {
    const page = await query.search({ text: summary.sessionId, limit: 5, surface: "log-only" });
    const hit = page.results[0];
    if (hit) openSession(hit.sessionId);
  } catch {
    /* no canonical adapter session recorded for this backend session */
  }
}

/** "3m" / "2h" / "4d" since a timestamp (ms). */
function ago(ms: number): string {
  const s = Math.max(0, Math.floor((Date.now() - ms) / 1000));
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  return `${Math.floor(h / 24)}d`;
}

type Group = {
  key: string;
  name: string;
  cwd: string;
  updatedAt: number;
  sessions: AgentSessionSummary[];
};

/** Group sessions by project (cwd), newest group first. */
function groupSessions(sessions: AgentSessionSummary[]): Group[] {
  const byKey = new Map<string, Group>();
  for (const s of sessions) {
    const key = s.cwd || s.projectSlug || s.backend;
    let g = byKey.get(key);
    if (!g) {
      g = {
        key,
        name: s.projectName || basename(s.cwd) || s.projectSlug || "Unknown",
        cwd: s.cwd,
        updatedAt: s.updatedAt,
        sessions: [],
      };
      byKey.set(key, g);
    }
    g.sessions.push(s);
    if (s.updatedAt > g.updatedAt) g.updatedAt = s.updatedAt;
  }
  const groups = [...byKey.values()];
  for (const g of groups) g.sessions.sort((a, b) => b.updatedAt - a.updatedAt);
  return groups.sort((a, b) => b.updatedAt - a.updatedAt);
}

/** Render a snippet with its matched [start,end) runs bolded. */
function HighlightedSnippet({ match }: { match: AgentSessionSearchMatch }) {
  const { snippet, highlights } = match;
  if (highlights.length === 0) return <>{snippet}</>;
  const out: ReactNode[] = [];
  let cursor = 0;
  highlights.forEach((h, i) => {
    if (h.start > cursor) out.push(snippet.slice(cursor, h.start));
    out.push(
      <mark key={i} className="rounded-sm bg-primary/25 px-0.5 text-foreground">
        {snippet.slice(h.start, h.end)}
      </mark>,
    );
    cursor = h.end;
  });
  if (cursor < snippet.length) out.push(snippet.slice(cursor));
  return <>{out}</>;
}

export function SessionHistory({
  backend,
  workspace,
  onBack,
  onOpen,
}: {
  backend: AgentBackend;
  /** The active rig's env — an ssh rig lists the sessions on ITS host. */
  workspace?: AgentWorkspace;
  onBack: () => void;
  onOpen: (summary: AgentSessionSummary) => void;
}) {
  const sessions = useCodingAgentsStore((s) => s.sessions);
  const sessionsError = useCodingAgentsStore((s) => s.sessionsError);
  const sessionsLoading = useCodingAgentsStore((s) => s.sessionsLoading);
  const loadSessions = useCodingAgentsStore((s) => s.loadSessions);
  // Present only while the trajectory plugin is enabled (ring-2 seam store).
  const trajectory = codingAgentUiRuntime().trajectory;
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<AgentSessionSearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const searchSeq = useRef(0);
  const remote = workspace?.kind === "ssh";
  const remoteLabel = remote
    ? `${workspace.user ? `${workspace.user}@` : ""}${workspace.host}`
    : null;

  useEffect(() => {
    void loadSessions(workspace);
  }, [loadSessions, workspace]);

  // Live refresh: a CLI (or our own run) wrote a transcript on disk → reload the
  // list so history stays fresh without a manual refresh. The main-side watcher
  // is already debounced. (Local disk only — remote hosts have no watcher; the
  // main-side listing cache covers staleness there.)
  useEffect(() => {
    if (remote) return;
    return codingAgentUiRuntime().events.subscribe(
      CODING_AGENT_EVENTS.sessionUpserted,
      () => {
      void loadSessions(workspace);
      },
    );
  }, [loadSessions, workspace, remote]);

  // Full-text search: debounce, then scan transcripts for message TEXT (not just
  // titles). A per-request sequence guards against out-of-order responses.
  // Local disk only — remote transcript search is a non-goal, so the box is
  // hidden for ssh rigs instead of returning lying empties.
  const trimmedQuery = query.trim();
  const searchActive = !remote && trimmedQuery.length >= 2;
  useEffect(() => {
    if (!searchActive) {
      setResults([]);
      setSearching(false);
      return;
    }
    const seq = ++searchSeq.current;
    setSearching(true);
    const timer = setTimeout(() => {
      void searchSessionsIpc(trimmedQuery, backend)
        .then((r) => {
          if (seq === searchSeq.current) {
            setResults(r);
            setSearching(false);
          }
        })
        .catch(() => {
          if (seq === searchSeq.current) {
            setResults([]);
            setSearching(false);
          }
        });
    }, 250);
    return () => clearTimeout(timer);
  }, [trimmedQuery, searchActive, backend]);

  const groups = useMemo(
    () => groupSessions(sessions.filter((s) => s.backend === backend)),
    [sessions, backend],
  );

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex shrink-0 flex-col gap-2 border-b border-border/50 px-3 py-2.5">
        <div className="flex items-center gap-2">
          <Button
            type="button"
            size="icon"
            variant="ghost"
            className="size-7"
            onClick={onBack}
            aria-label="Back"
            title="Back"
          >
            <HugeiconsIcon
              icon={ArrowLeft01Icon}
              size={16}
              strokeWidth={1.75}
            />
          </Button>
          <span className="text-sm font-semibold text-foreground">
            {backendMeta(backend).label} history
          </span>
          {remoteLabel && (
            <span
              className="truncate rounded-full bg-accent px-1.5 py-0.5 font-mono text-xs font-medium text-muted-foreground"
              title={`Sessions on ${remoteLabel}`}
            >
              {remoteLabel}
            </span>
          )}
          {sessions.length > 0 && (
            <span className="rounded-full bg-accent px-1.5 py-0.5 text-xs font-medium text-muted-foreground">
              {sessions.length}
            </span>
          )}
        </div>
        {/* Full-text search across the message bodies of every saved session.
            Local disk only — remote transcript search is a non-goal. */}
        {!remote && (
          <div className="flex items-center gap-1.5 rounded-lg border border-border/60 bg-background px-2 py-1.5 focus-within:border-border focus-within:ring-1 focus-within:ring-ring/40">
            <HugeiconsIcon
              icon={Search01Icon}
              size={14}
              strokeWidth={1.75}
              className="shrink-0 text-muted-foreground/70"
            />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search message text…"
              className="min-w-0 flex-1 bg-transparent text-xs text-foreground placeholder:text-muted-foreground/70 focus-visible:outline-none"
            />
            {query && (
              <button
                type="button"
                onClick={() => setQuery("")}
                aria-label="Clear search"
                className="shrink-0 text-muted-foreground/70 hover:text-foreground"
              >
                <HugeiconsIcon
                  icon={Cancel01Icon}
                  size={13}
                  strokeWidth={1.75}
                />
              </button>
            )}
          </div>
        )}
      </div>

      {sessionsError ? (
        <div className="flex flex-1 items-center justify-center px-8 text-center text-xs text-muted-foreground">
          {sessionsError}
        </div>
      ) : searchActive ? (
        <SearchResults
          results={results}
          searching={searching}
          onOpen={onOpen}
        />
      ) : groups.length === 0 && sessionsLoading ? (
        // Don't flash "none found" while a (possibly slow, ssh) load is running.
        <div className="flex flex-1 items-center justify-center px-8 text-center text-xs text-muted-foreground">
          Loading history…
        </div>
      ) : groups.length === 0 ? (
        <div className="flex flex-1 items-center justify-center px-8 text-center text-xs text-muted-foreground">
          No past agent sessions found.
        </div>
      ) : (
        <div className="min-h-0 flex-1 space-y-2 overflow-y-auto p-3">
          {groups.map((g, gi) => (
            <Collapsible
              key={g.key}
              defaultOpen={gi === 0}
              className="group/hist overflow-hidden rounded-xl border border-border/50 bg-card/40"
            >
              <CollapsibleTrigger className="flex w-full items-center gap-2 px-2.5 py-2 text-left transition-colors hover:bg-muted/40">
                <HugeiconsIcon
                  icon={ArrowRight01Icon}
                  size={13}
                  strokeWidth={2}
                  className="shrink-0 text-muted-foreground transition-transform group-data-[state=open]/hist:rotate-90"
                />
                <span className="min-w-0 flex-1 truncate text-xs font-semibold text-foreground">
                  {g.name}
                </span>
                <span className="shrink-0 rounded-full bg-accent px-1.5 py-0.5 text-xs font-medium text-muted-foreground">
                  {g.sessions.length}
                </span>
                <span className="shrink-0 text-xs text-muted-foreground/70">
                  {ago(g.updatedAt)}
                </span>
              </CollapsibleTrigger>
              <CollapsibleContent className="termco-collapsible-content">
                <div className="space-y-1.5 border-t border-border/40 p-2">
                  {g.sessions.map((s) => (
                    <ContextMenu
                      key={`${s.backend}:${s.sessionId}:${s.filePath ?? ""}`}
                      modal={false}
                    >
                      <ContextMenuTrigger asChild>
                    <button
                      type="button"
                      onClick={() => onOpen(s)}
                      className={cn(
                        "flex w-full gap-2.5 rounded-lg border border-border/50 bg-card p-2.5 text-left transition-colors",
                        "hover:border-border",
                      )}
                    >
                      <BackendAvatar backend={s.backend} size={28} />
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-xs font-medium text-foreground">
                          {s.name}
                        </div>
                        <div className="mt-0.5 flex items-center gap-1.5 font-mono text-xs text-muted-foreground/80">
                          <span className="inline-flex shrink-0 items-center gap-0.5">
                            <HugeiconsIcon
                              icon={Message01Icon}
                              size={9}
                              strokeWidth={1.75}
                            />
                            {s.messageCount}
                          </span>
                          <span className="opacity-40">·</span>
                          <span className="inline-flex shrink-0 items-center gap-0.5">
                            <HugeiconsIcon
                              icon={Clock01Icon}
                              size={9}
                              strokeWidth={1.75}
                            />
                            {ago(s.updatedAt)}
                          </span>
                        </div>
                      </div>
                    </button>
                      </ContextMenuTrigger>
                      <ContextMenuContent>
                        <ContextMenuItem onSelect={() => onOpen(s)}>
                          Open transcript
                        </ContextMenuItem>
                        {trajectory && (
                          <ContextMenuItem
                            data-testid="session-history-open-trajectory"
                            onSelect={() =>
                              void openTrajectoryForSummary(s, (sessionId) =>
                                trajectory.openSession(sessionId as never),
                              )
                            }
                          >
                            Open trajectory
                          </ContextMenuItem>
                        )}
                      </ContextMenuContent>
                    </ContextMenu>
                  ))}
                </div>
              </CollapsibleContent>
            </Collapsible>
          ))}
        </div>
      )}
    </div>
  );
}

/** Flat list of sessions whose transcript TEXT matched the query, each with
 * highlighted snippets. Clicking opens the saved transcript. */
function SearchResults({
  results,
  searching,
  onOpen,
}: {
  results: AgentSessionSearchResult[];
  searching: boolean;
  onOpen: (summary: AgentSessionSummary) => void;
}) {
  if (searching && results.length === 0) {
    return (
      <div className="flex flex-1 items-center justify-center px-8 text-center text-xs text-muted-foreground">
        Searching…
      </div>
    );
  }
  if (results.length === 0) {
    return (
      <div className="flex flex-1 items-center justify-center px-8 text-center text-xs text-muted-foreground">
        No messages match your search.
      </div>
    );
  }
  return (
    <div className="min-h-0 flex-1 space-y-2 overflow-y-auto p-3">
      {results.map((r) => (
        <button
          key={`${r.summary.backend}:${r.summary.sessionId}:${r.summary.filePath ?? ""}`}
          type="button"
          onClick={() => onOpen(r.summary)}
          className="flex w-full flex-col gap-1.5 rounded-lg border border-border/50 bg-card p-2.5 text-left transition-colors hover:border-border"
        >
          <div className="flex items-center gap-2">
            <BackendAvatar backend={r.summary.backend} size={22} />
            <span className="min-w-0 flex-1 truncate text-xs font-medium text-foreground">
              {r.summary.name}
            </span>
            <span className="shrink-0 rounded-full bg-accent px-1.5 py-0.5 text-xs font-medium text-muted-foreground">
              {r.totalMatches}
            </span>
          </div>
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground/70">
            <span className="truncate">
              {r.summary.projectName || r.summary.cwd || "—"}
            </span>
            <span className="opacity-40">·</span>
            <span className="shrink-0 inline-flex items-center gap-0.5">
              <HugeiconsIcon icon={Clock01Icon} size={9} strokeWidth={1.75} />
              {ago(r.summary.updatedAt)}
            </span>
          </div>
          <div className="space-y-1">
            {r.matches.map((m, mi) => (
              <div
                key={mi}
                className="flex gap-1.5 rounded-md bg-muted/40 px-2 py-1 text-xs leading-snug text-muted-foreground"
              >
                <span
                  className={cn(
                    "shrink-0 select-none font-mono text-xs uppercase tracking-wide",
                    m.role === "user"
                      ? "text-primary/70"
                      : "text-emerald-500/70",
                  )}
                >
                  {m.role === "user" ? "you" : "ai"}
                </span>
                <span className="min-w-0 flex-1">
                  <HighlightedSnippet match={m} />
                </span>
              </div>
            ))}
          </div>
        </button>
      ))}
    </div>
  );
}
