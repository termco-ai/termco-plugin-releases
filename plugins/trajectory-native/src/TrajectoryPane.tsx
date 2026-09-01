import {
  SessionId,
  SessionSeq,
  projectTrajectory,
  type SessionEventExplanation,
  type SessionHistoryCapability,
  type SessionListing,
  type SessionQueryCapability,
  type TrajectoryRecord,
} from "@termco/session-base";
import ui from "@termco/ui";
import { NextIcon, PauseIcon, PlayIcon, PreviousIcon, StopIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useEffect, useMemo, useRef, useState } from "react";
import { Inspector } from "./Inspector";
import { listAllSessions } from "./lineage";
import { RECORD_GROUPS, recordGroup } from "./recordMeta";
import { recoverSessionForContinuation } from "./recovery";
import { SessionList } from "./SessionList";
import { SessionHealthBanner } from "./SessionHealthBanner";
import { TrajectoryLedger, type RecordAction } from "./TrajectoryLedger";
import { TimingOverview } from "./TimingOverview";
import { lastCheckpointAtOrBefore, openOwningSurface } from "./actions";
import { explainTrajectoryRecord } from "./causal";
import { getTrajectoryRuntime } from "./runtime";
import { usePlayback } from "./usePlayback";
import { useSessionWindow } from "./useSessionWindow";
import { useTrajectoryUi } from "./uiStore";

const { Badge, Button, Input } = ui;

export function TrajectoryPane({
  sessionId,
  initialEventSeq,
  initialRecordId,
  history,
  queryService,
  onOpenSession,
}: {
  readonly sessionId: string;
  readonly initialEventSeq?: number;
  readonly initialRecordId?: string;
  readonly history: SessionHistoryCapability;
  readonly queryService: SessionQueryCapability | null;
  readonly onOpenSession: (sessionId: string, eventSeq?: number, recordId?: string) => void;
}) {
  if (!sessionId) {
    return (
      <SessionList
        history={history}
        onOpenSession={onOpenSession}
        onResume={(listing: SessionListing) => void resume(listing)}
      />
    );
  }
  return <SessionView sessionId={sessionId} initialEventSeq={initialEventSeq} initialRecordId={initialRecordId} history={history} queryService={queryService} onOpenSession={onOpenSession} />;
}

async function resume(listing: SessionListing): Promise<void> {
  const runtime = getTrajectoryRuntime();
  if (listing.backend === "chat") await runtime.aiSessions?.openSession(listing.sessionId);
  else runtime.codingAgents?.openRun(String(listing.sessionId));
}

function SessionView({
  sessionId,
  initialEventSeq,
  initialRecordId,
  history,
  queryService,
  onOpenSession,
}: {
  readonly sessionId: string;
  readonly initialEventSeq?: number;
  readonly initialRecordId?: string;
  readonly history: SessionHistoryCapability;
  readonly queryService: SessionQueryCapability | null;
  readonly onOpenSession: (sessionId: string, eventSeq?: number, recordId?: string) => void;
}) {
  const window = useSessionWindow(history, SessionId(sessionId));
  const [disabledGroups, setDisabledGroups] = useState<Set<string>>(() => new Set());
  const [textFilter, setTextFilter] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(initialRecordId ?? null);
  const [timingFocusedIds, setTimingFocusedIds] = useState<ReadonlySet<string>>(() => new Set());
  const [highlightedEventSeq, setHighlightedEventSeq] = useState<number | null>(initialEventSeq ?? null);
  const [causal, setCausal] = useState<SessionEventExplanation | null>(null);
  const [causalLoading, setCausalLoading] = useState(false);
  const [causalError, setCausalError] = useState<string | null>(null);
  const [recovering, setRecovering] = useState(false);
  const [recoveryError, setRecoveryError] = useState<string | null>(null);
  const [catalogChildren, setCatalogChildren] = useState<readonly string[]>([]);
  const requestedSeqs = useRef(new Set<number>());
  const setForkPrompt = useTrajectoryUi((state) => state.setForkPrompt);
  const highlight = useTrajectoryUi((state) => state.highlight);
  useEffect(() => {
    if (!highlight || highlight.sessionId !== sessionId) return;
    setHighlightedEventSeq(highlight.eventSeq);
  }, [highlight, sessionId]);

  const records = useMemo(
    () => window.header ? projectTrajectory(window.header, window.events).records : [],
    [window.events, window.header],
  );
  useEffect(() => {
    let active = true;
    void listAllSessions(history).then(
      (sessions) => {
        if (!active) return;
        setCatalogChildren(sessions
          .filter((listing) => String(listing.parentSessionId ?? "") === sessionId)
          .map((listing) => String(listing.sessionId)));
      },
      () => { if (active) setCatalogChildren([]); },
    );
    return () => { active = false; };
  }, [history, sessionId]);
  const children = useMemo(() => {
    const ids = new Set(catalogChildren);
    for (const event of window.events) {
      if (event.type !== "subagent/start") continue;
      const childSessionId = (event.data as { readonly childSessionId?: string }).childSessionId;
      if (childSessionId) ids.add(String(childSessionId));
    }
    return [...ids];
  }, [catalogChildren, window.events]);
  useEffect(() => {
    if (highlightedEventSeq === null) return;
    const match = records.find((record) => record.id === `${sessionId}:event:${highlightedEventSeq}`)
      ?? records.find((record) => record.sourceSeqs.some((seq) => (seq as number) === highlightedEventSeq));
    if (match) setSelectedId(match.id);
    else if (window.header && !requestedSeqs.current.has(highlightedEventSeq)) {
      requestedSeqs.current.add(highlightedEventSeq);
      void window.loadAround(SessionSeq(highlightedEventSeq));
    }
  }, [highlightedEventSeq, records, sessionId, window]);
  const filtered = useMemo(() => {
    const query = textFilter.trim().toLowerCase();
    return records.filter((record) => {
      if (disabledGroups.has(recordGroup(record.kind))) return false;
      return !query || record.searchableText.toLowerCase().includes(query) || record.summary.toLowerCase().includes(query);
    });
  }, [disabledGroups, records, textFilter]);
  const playback = usePlayback(filtered.map((record) => record.time.start));
  const playhead = playback.position === null
    ? null
    : filtered[playback.position]?.id ?? null;
  const selected = records.find((record) => record.id === (playhead ?? selectedId)) ?? null;
  useEffect(() => {
    const seq = selected?.sourceSeqs[0];
    if (!queryService || !selected || seq === undefined) {
      setCausal(null);
      setCausalLoading(false);
      setCausalError(null);
      return;
    }
    let active = true;
    setCausalLoading(true);
    setCausalError(null);
    void explainTrajectoryRecord(queryService, SessionId(sessionId), selected).then(
      (explanation) => {
        if (!active) return;
        setCausal(explanation);
        setCausalLoading(false);
      },
      (error) => {
        if (!active) return;
        setCausal(null);
        setCausalError(error instanceof Error ? error.message : String(error));
        setCausalLoading(false);
      },
    );
    return () => { active = false; };
  }, [queryService, selected?.id, sessionId]);

  const recover = async () => {
    if (recovering) return;
    setRecovering(true);
    setRecoveryError(null);
    try {
      await recoverSessionForContinuation(history, SessionId(sessionId), window.refresh);
    } catch (error) {
      setRecoveryError(error instanceof Error ? error.message : String(error));
    } finally {
      setRecovering(false);
    }
  };

  const copy = (record: TrajectoryRecord) => {
    void navigator.clipboard?.writeText(JSON.stringify(record.inspector, null, 2)).catch(() => undefined);
  };
  const actions = useMemo<readonly RecordAction[]>(() => {
    const result: RecordAction[] = [
      { id: "copy", label: "Copy record", run: copy },
      { id: "jump", label: window.header?.backend === "chat" ? "Open chat" : "Open agent run", run: () => { if (window.header) void openOwningSurface(window.header); } },
      {
        id: "fork",
        label: "Fork from here",
        run(record) {
          const eventSeq = record.sourceSeqs[0] as number | undefined;
          if (eventSeq === undefined || !window.header) return;
          setForkPrompt({
            sessionId,
            eventSeq,
            backend: window.header.backend,
            fidelity: window.header.fidelity,
            mode: "fork",
            checkpoint: lastCheckpointAtOrBefore(window.events, eventSeq),
          });
        },
      },
    ];
    if (window.header?.backend === "chat" && getTrajectoryRuntime().aiSessions) {
      result.push({
        id: "rerun",
        label: "Re-run as fork",
        run(record) {
          const eventSeq = record.sourceSeqs[0] as number | undefined;
          if (eventSeq === undefined || !window.header) return;
          setForkPrompt({ sessionId, eventSeq, backend: window.header.backend, fidelity: window.header.fidelity, mode: "rerun", checkpoint: null });
        },
      });
    }
    return result;
  }, [sessionId, setForkPrompt, window.events, window.header]);

  return (
    <div className="flex h-full min-h-0 flex-col" data-testid="trajectory-pane">
      <div className="flex shrink-0 flex-col gap-2 border-b border-border/60 px-3 py-2">
        <div className="flex min-w-0 items-center gap-2">
          {window.header && <Badge variant={window.header.fidelity === "full" ? "default" : "secondary"} className="text-[10px]" data-testid="trajectory-fidelity">{window.header.fidelity}</Badge>}
          {window.error && <Badge variant="destructive" className="text-[10px]" title={window.error}>Needs attention</Badge>}
          <span className="max-w-48 truncate font-mono text-[10px] text-muted-foreground" title={sessionId}>{sessionId}</span>
          <span className="text-[10px] tabular-nums text-muted-foreground">{filtered.length} / {records.length} records</span>
          <div className="ml-auto flex shrink-0 items-center gap-1" role="group" aria-label="Trajectory playback">
            {window.hasEarlier && <Button size="sm" variant="ghost" className="h-7 px-2 text-[10px]" onClick={() => void window.loadEarlier()}>Load earlier</Button>}
            <Button size="sm" variant="ghost" className="h-7 w-7 p-0" aria-label="Previous record" title="Previous record" onClick={() => playback.step(-1)}><HugeiconsIcon icon={PreviousIcon} size={13} /></Button>
            <Button size="sm" variant={playback.playing ? "default" : "ghost"} className="h-7 w-7 p-0" aria-label={playback.playing ? "Pause playback" : "Play trajectory"} title={playback.playing ? "Pause playback" : "Play trajectory"} data-testid="trajectory-play" onClick={() => playback.playing ? playback.pause() : playback.play()}><HugeiconsIcon icon={playback.playing ? PauseIcon : PlayIcon} size={13} /></Button>
            <Button size="sm" variant="ghost" className="h-7 w-7 p-0" aria-label="Next record" title="Next record" onClick={() => playback.step(1)}><HugeiconsIcon icon={NextIcon} size={13} /></Button>
            <Button size="sm" variant="ghost" className="h-7 px-2 font-mono text-[10px]" aria-label={`Playback speed ${playback.speed} times`} title="Change playback speed" onClick={() => playback.setSpeed(playback.speed >= 4 ? 1 : playback.speed * 2)}>{playback.speed}×</Button>
            {playback.position !== null && <Button size="sm" variant="ghost" className="h-7 gap-1 px-2 text-[10px]" onClick={playback.stop}><HugeiconsIcon icon={StopIcon} size={12} />Live</Button>}
          </div>
        </div>
        <div className="flex min-w-0 items-center gap-2">
          <div className="flex min-w-0 flex-1 gap-1 overflow-x-auto pb-0.5" role="group" aria-label="Record groups">
            {RECORD_GROUPS.map((group) => {
              const enabled = !disabledGroups.has(group.id);
              return (
                <button key={group.id} type="button" aria-pressed={enabled} data-testid={`trajectory-chip-${group.id}`} data-state={enabled ? "on" : "off"} className={`shrink-0 rounded-md border px-2 py-1 text-[10px] transition-colors ${enabled ? "border-primary/35 bg-primary/10 text-foreground" : "border-border/60 text-muted-foreground hover:bg-muted/50"}`} onClick={() => setDisabledGroups((current) => {
                  const next = new Set(current);
                  if (next.has(group.id)) next.delete(group.id); else next.add(group.id);
                  return next;
                })}>{group.label}</button>
              );
            })}
          </div>
          <Input aria-label="Filter trajectory records" value={textFilter} onChange={(event) => setTextFilter(event.target.value)} placeholder="Filter records…" className="h-7 w-44 shrink-0 text-xs" data-testid="trajectory-text-filter" />
        </div>
        {(window.header?.parent || children.length > 0) && (
          <nav aria-label="Session lineage" className="flex min-w-0 flex-wrap items-center gap-1 text-[10px]">
            <span className="text-muted-foreground">Lineage</span>
            {window.header?.parent && (
              <button
                type="button"
                className="max-w-48 truncate rounded border border-border/60 px-1.5 py-0.5 font-mono hover:bg-muted focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary"
                title={String(window.header.parent.sessionId)}
                onClick={() => onOpenSession(String(window.header!.parent!.sessionId), window.header!.parent!.boundarySeq as number)}
              >Parent · {window.header.parent.sessionId}</button>
            )}
            {children.map((child) => (
              <button key={child} type="button" className="max-w-48 truncate rounded border border-border/60 px-1.5 py-0.5 font-mono hover:bg-muted focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary" title={child} onClick={() => onOpenSession(child)}>Child · {child}</button>
            ))}
          </nav>
        )}
      </div>
      <SessionHealthBanner repair={window.repair} recovering={recovering} recoveryError={recoveryError} onRecover={() => void recover()} />
      <TimingOverview
        records={filtered}
        hasEarlier={window.hasEarlier}
        onLoadEarlier={() => void window.loadEarlier()}
        onSelectRecords={(recordIds) => {
          setTimingFocusedIds(new Set(recordIds));
          if (recordIds[0]) setSelectedId(recordIds[0]);
        }}
      />
      <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
        <div className="min-h-0 min-w-0 flex-[3] border-b border-border/60 lg:border-b-0 lg:border-r">
          {window.loading && !window.header ? <div className="p-4 text-xs text-muted-foreground">Loading…</div> : window.error && !window.header ? <div className="p-4 text-xs text-destructive">{window.error}</div> : (
            <TrajectoryLedger records={filtered} selectedId={playhead ?? selectedId} focusedIds={timingFocusedIds} highlightedEventSeq={highlightedEventSeq} onSelect={(record) => { setTimingFocusedIds(new Set()); setSelectedId(record.id); }} actions={actions} />
          )}
        </div>
        <div className="min-h-0 min-w-0 flex-[2]"><Inspector record={selected} records={records} startTime={records[0]?.time.start ?? 0} onCopy={copy} causal={causal} causalLoading={causalLoading} causalError={causalError} onNavigateSeq={setHighlightedEventSeq} /></div>
      </div>
    </div>
  );
}
