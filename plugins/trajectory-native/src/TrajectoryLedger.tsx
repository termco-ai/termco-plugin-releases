import type { TrajectoryRecord } from "@termco/session-base";
import ui from "@termco/ui";
import { MoreVerticalIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { useEffect, useRef, useState } from "react";
import {
  formatDuration,
  formatNesting,
  formatTimeDelta,
  recordColor,
  recordKindLabel,
  recordPreview,
} from "./recordMeta";

const { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } = ui;

function statusDot(status: TrajectoryRecord["status"]): string {
  if (status === "failed") return "bg-destructive";
  if (status === "cancelled") return "bg-amber-500";
  if (status === "running" || status === "pending") return "bg-primary";
  if (status === "completed") return "bg-emerald-500";
  return "bg-muted-foreground/50";
}

export type RecordAction = {
  readonly id: string;
  readonly label: string;
  readonly run: (record: TrajectoryRecord) => void;
};

export function TrajectoryLedger({
  records,
  selectedId,
  focusedIds,
  highlightedEventSeq,
  onSelect,
  actions,
}: {
  readonly records: readonly TrajectoryRecord[];
  readonly selectedId: string | null;
  readonly focusedIds?: ReadonlySet<string>;
  readonly highlightedEventSeq: number | null;
  readonly onSelect: (record: TrajectoryRecord) => void;
  readonly actions: readonly RecordAction[];
}) {
  "use no memo";
  const scrollRef = useRef<HTMLDivElement>(null);
  const [followLive, setFollowLive] = useState(true);
  const virtualizer = useVirtualizer({
    count: records.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => 48,
    overscan: 12,
    getItemKey: (index) => records[index]?.id ?? index,
  });
  const start = records[0]?.time.start ?? 0;

  useEffect(() => {
    if (highlightedEventSeq === null) return;
    const index = records.findIndex((record) => record.sourceSeqs.some((seq) => (seq as number) === highlightedEventSeq));
    if (index >= 0) virtualizer.scrollToIndex(index, { align: "center" });
  }, [highlightedEventSeq, records, virtualizer]);

  useEffect(() => {
    if (!followLive || records.length === 0 || highlightedEventSeq !== null) return;
    virtualizer.scrollToIndex(records.length - 1, { align: "end" });
  }, [followLive, highlightedEventSeq, records.length, virtualizer]);

  const jumpToLive = () => {
    setFollowLive(true);
    if (records.length > 0) virtualizer.scrollToIndex(records.length - 1, { align: "end" });
  };

  return (
    <div className="relative h-full" data-testid="trajectory-ledger">
      {!followLive && (
        <button
          type="button"
          className="absolute left-1/2 top-2 z-10 -translate-x-1/2 rounded-full border border-border bg-background/95 px-2.5 py-1 text-[10px] shadow-sm hover:bg-muted focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary"
          aria-label="Jump to live trajectory tail"
          onClick={jumpToLive}
        >Jump to live</button>
      )}
      <div
        ref={scrollRef}
        className="h-full overflow-auto"
        data-follow-live={followLive ? "true" : "false"}
        role="listbox"
        aria-label="Trajectory records"
        aria-activedescendant={selectedId ? `trajectory-option-${selectedId}` : undefined}
        onScroll={(event) => {
          const target = event.currentTarget;
          const atTail = target.scrollHeight - target.scrollTop - target.clientHeight <= 32;
          setFollowLive(atTail);
        }}
      >
        <div className="relative w-full" style={{ height: virtualizer.getTotalSize() }}>
        {virtualizer.getVirtualItems().map((row) => {
          const record = records[row.index]!;
          const color = recordColor(record.kind);
          const eventSeq = record.sourceSeqs[0] as number | undefined;
          const highlighted = highlightedEventSeq !== null && record.sourceSeqs.some((seq) => (seq as number) === highlightedEventSeq);
          const timingFocused = focusedIds?.has(record.id) ?? false;
          return (
            <div
              key={record.id}
              data-testid="trajectory-record-row"
              data-record-id={record.id}
              data-record-kind={record.kind}
              data-selected={selectedId === record.id ? "true" : undefined}
              data-timing-focused={timingFocused ? "true" : undefined}
              className={`absolute left-0 flex w-full items-center border-b border-border/40 text-xs transition-colors hover:bg-muted/50 ${selectedId === record.id ? "bg-primary/8" : ""} ${highlighted ? "ring-1 ring-inset ring-primary" : ""} ${timingFocused ? "bg-primary/5" : ""}`}
              style={{ height: row.size, transform: `translateY(${row.start}px)` }}
            >
              <button
                type="button"
                id={`trajectory-option-${record.id}`}
                role="option"
                aria-selected={selectedId === record.id}
                aria-label={`Event ${eventSeq ?? "session header"}: ${recordKindLabel(record.kind)}. ${record.summary}. ${record.status}.`}
                aria-posinset={row.index + 1}
                aria-setsize={records.length}
                className="grid min-w-0 flex-1 grid-cols-[2px_3rem_6.5rem_minmax(8rem,1fr)] items-center gap-2 self-stretch px-2 text-left focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-primary sm:grid-cols-[2px_3rem_6.5rem_minmax(7rem,0.8fr)_minmax(10rem,1.4fr)_4.5rem]"
                onClick={() => { if (row.index < records.length - 1) setFollowLive(false); onSelect(record); }}
              >
                <span className={`h-6 w-0.5 rounded ${color.bar}`} aria-hidden="true" />
                <span className="font-mono text-[10px] tabular-nums text-muted-foreground">#{eventSeq ?? "–"}</span>
                <span className="min-w-0">
                  <span className={`flex items-center gap-1.5 truncate text-[11px] font-medium ${color.text}`}>
                    <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${statusDot(record.status)}`} aria-label={record.status} />
                    {recordKindLabel(record.kind)}
                  </span>
                  <span className="block truncate font-mono text-[9px] text-muted-foreground/75">{formatNesting(record.nesting)}</span>
                </span>
                <span className="min-w-0 truncate text-[11px] text-foreground" title={record.summary}>{record.summary}</span>
                <span className="hidden min-w-0 truncate text-[10px] text-muted-foreground sm:block" title={record.searchableText}>{recordPreview(record)}</span>
                <span className="hidden text-right font-mono text-[9px] tabular-nums text-muted-foreground sm:block">
                  <span className="block">{formatTimeDelta(record.time.start, start)}</span>
                  <span className="block">{formatDuration(record.time)}</span>
                </span>
              </button>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button type="button" aria-label="Record actions" className="mr-1 rounded p-1 hover:bg-muted">
                    <HugeiconsIcon icon={MoreVerticalIcon} size={14} />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  {actions.map((action) => (
                    <DropdownMenuItem key={action.id} onSelect={() => action.run(record)}>{action.label}</DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          );
        })}
        </div>
      </div>
    </div>
  );
}
