import type { SessionHistoryCapability, SessionListing } from "@termco/session-base";
import ui from "@termco/ui";
import { useCallback, useEffect, useState } from "react";
import { buildSessionLineageRows, listAllSessions } from "./lineage";

const { Badge, Button } = ui;

function age(time: number): string {
  const delta = Date.now() - time;
  if (delta < 60_000) return "just now";
  if (delta < 3_600_000) return `${Math.floor(delta / 60_000)}m ago`;
  if (delta < 86_400_000) return `${Math.floor(delta / 3_600_000)}h ago`;
  return `${Math.floor(delta / 86_400_000)}d ago`;
}

function healthLabel(health: SessionListing["health"]): string {
  switch (health) {
    case "waiting-input": return "Waiting for input";
    case "open-tail": return "Open turn";
    case "repairable-tail": return "Recovery available";
    case "corrupt-prefix": return "Corrupt history";
    case "unsupported-format": return "Unsupported format";
    default: return "Healthy";
  }
}

export function SessionList({
  history,
  onOpenSession,
  onResume,
}: {
  readonly history: SessionHistoryCapability;
  readonly onOpenSession: (sessionId: string) => void;
  readonly onResume: (listing: SessionListing) => void;
}) {
  const [sessions, setSessions] = useState<readonly SessionListing[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const reload = useCallback(() => {
    setLoading(true);
    setError(null);
    void listAllSessions(history).then(
      setSessions,
      (cause) => setError(cause instanceof Error ? cause.message : String(cause)),
    ).finally(() => setLoading(false));
  }, [history]);
  useEffect(reload, [reload]);

  return (
    <div className="flex h-full flex-col" data-testid="trajectory-session-list">
      <div className="flex items-center gap-2 border-b border-border/60 px-3 py-2">
        <h3 className="text-xs font-semibold">Sessions</h3>
        <span className="text-[10px] text-muted-foreground">{sessions.length} recorded</span>
        <Button size="sm" variant="ghost" className="ml-auto h-6 px-2 text-[10px]" onClick={reload}>Refresh</Button>
      </div>
      <div className="min-h-0 flex-1 overflow-auto">
        {loading && sessions.length === 0 ? (
          <div className="p-4 text-xs text-muted-foreground">Loading…</div>
        ) : error ? (
          <div className="p-4 text-xs text-destructive">{error}</div>
        ) : sessions.length === 0 ? (
          <div className="p-4 text-xs text-muted-foreground">No sessions recorded yet.</div>
        ) : <div role="tree" aria-label="Recorded session lineage">
          {buildSessionLineageRows(sessions).map(({ session, depth, hasChildren, parentMissing }) => (
          <div
            key={session.sessionId}
            role="treeitem"
            aria-level={depth + 1}
            aria-expanded={hasChildren ? true : undefined}
            data-testid="trajectory-session-row"
            className="flex min-w-0 flex-wrap items-center gap-2 border-b border-border/40 py-2 pe-3 text-xs hover:bg-muted/40 sm:flex-nowrap"
            style={{ paddingInlineStart: `${12 + depth * 20}px` }}
          >
            <Badge variant={session.fidelity === "full" ? "default" : "secondary"} className="px-1.5 py-0 text-[10px]">{session.fidelity}</Badge>
            <span className="w-20 shrink-0 truncate font-mono text-[10px] text-muted-foreground">{session.backend}</span>
            <div className="min-w-32 flex-1">
              <button type="button" className="block max-w-full truncate text-left hover:underline focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary" onClick={() => onOpenSession(session.sessionId)} title={session.sessionId}>
                {session.title || session.sessionId}
              </button>
              {session.parentSessionId && (
                <span className="block truncate text-[9px] text-muted-foreground">
                  {parentMissing ? "Parent not in this page" : `Child of ${session.parentSessionId}`}
                </span>
              )}
            </div>
            {session.health !== "healthy" && <Badge variant="outline" className="text-[10px]">{healthLabel(session.health)}</Badge>}
            <span className="shrink-0 text-[10px] text-muted-foreground">{age(session.updatedAt)}</span>
            <Button
              size="sm"
              variant="ghost"
              className="h-6 px-2 text-[10px]"
              aria-label={`Resume ${session.title || session.sessionId}`}
              disabled={session.health === "corrupt-prefix" || session.health === "unsupported-format"}
              title={session.health === "corrupt-prefix" || session.health === "unsupported-format" ? "This history cannot be resumed safely" : undefined}
              onClick={() => onResume(session)}
            >Resume</Button>
            <Button size="sm" variant="outline" className="h-6 px-2 text-[10px]" aria-label={`Open ${session.title || session.sessionId}`} onClick={() => onOpenSession(session.sessionId)}>Open</Button>
          </div>
        ))}
        </div>}
      </div>
    </div>
  );
}
