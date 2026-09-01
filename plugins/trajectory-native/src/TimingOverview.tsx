import type { TrajectoryRecord } from "@termco/session-base";
import { useMemo, useRef, useState } from "react";
import {
  buildTimingIntervals,
  layoutTimingIntervals,
  overlappingRecordIds,
  panTimingViewport,
  zoomTimingViewport,
  type TimingLane,
  type TimingScaleMode,
  type TimingViewport,
} from "./timingModel";

const CHART_WIDTH = 1_000;
const LABEL_WIDTH = 92;
const LANE_HEIGHT = 24;

const LANES: readonly { readonly id: TimingLane; readonly label: string; readonly color: string }[] = [
  { id: "model", label: "Model", color: "text-violet-500" },
  { id: "tool", label: "Tools", color: "text-cyan-500" },
  { id: "approval", label: "Approval", color: "text-amber-500" },
  { id: "retry", label: "Retry", color: "text-rose-500" },
  { id: "compaction", label: "Compaction", color: "text-fuchsia-500" },
  { id: "subagent", label: "Subagents", color: "text-orange-500" },
  { id: "durability", label: "Durability", color: "text-teal-500" },
];

function durationLabel(start: number, end?: number): string {
  if (end === undefined) return "in progress; duration unknown";
  const duration = Math.max(0, end - start);
  return `${duration}ms; start ${start}; end ${end}`;
}

function domainOf(intervals: ReturnType<typeof buildTimingIntervals>): { start: number; end: number } {
  if (intervals.length === 0) return { start: 0, end: 1 };
  const start = Math.min(...intervals.map((entry) => entry.start));
  const end = Math.max(start + 1, ...intervals.map((entry) => entry.end ?? entry.start));
  return { start, end };
}

function localX(event: React.PointerEvent<SVGSVGElement>): number {
  const rect = event.currentTarget.getBoundingClientRect();
  if (rect.width <= 0) return event.clientX;
  return Math.min(CHART_WIDTH, Math.max(0, (event.clientX - rect.left) / rect.width * CHART_WIDTH));
}

export function TimingOverview({
  records,
  hasEarlier,
  onLoadEarlier,
  onSelectRecords,
}: {
  readonly records: readonly TrajectoryRecord[];
  readonly hasEarlier: boolean;
  readonly onLoadEarlier: () => void;
  readonly onSelectRecords: (recordIds: readonly string[]) => void;
}) {
  const intervals = useMemo(() => buildTimingIntervals(records), [records]);
  const [scale, setScale] = useState<TimingScaleMode>("actual");
  const [viewport, setViewport] = useState<TimingViewport>({ zoom: 1, pan: 0 });
  const drag = useRef<{ button: number; x: number; pan: number } | null>(null);
  const positioned = useMemo(
    () => layoutTimingIntervals(intervals, CHART_WIDTH - LABEL_WIDTH, scale, viewport),
    [intervals, scale, viewport],
  );
  const presentLanes = LANES.filter((lane) => intervals.some((entry) => entry.lane === lane.id));
  const domain = domainOf(intervals);

  const finishSelection = (x: number) => {
    const startDrag = drag.current;
    drag.current = null;
    if (!startDrag || startDrag.button !== 0 || Math.abs(x - startDrag.x) < 3 || scale !== "actual") return;
    const contentWidth = CHART_WIDTH - LABEL_WIDTH;
    const toTime = (position: number) => {
      const normalized = ((position - LABEL_WIDTH) / contentWidth + viewport.pan) / viewport.zoom;
      return domain.start + normalized * (domain.end - domain.start);
    };
    onSelectRecords(overlappingRecordIds(intervals, toTime(startDrag.x), toTime(x)));
  };

  return (
    <section
      aria-label="Trajectory timing overview"
      role="region"
      data-scale={scale}
      data-zoom={String(viewport.zoom)}
      className="shrink-0 border-b border-border/60 bg-muted/10"
    >
      <div className="flex min-h-8 items-center gap-1 border-b border-border/40 px-2 py-1">
        <span className="mr-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Timing</span>
        {hasEarlier && (
          <button type="button" className="h-6 rounded border border-border px-2 text-[10px] hover:bg-muted focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary" aria-label="Load earlier timing records" onClick={onLoadEarlier}>
            Earlier events omitted
          </button>
        )}
        <div className="ml-auto flex items-center gap-1" role="group" aria-label="Timing overview controls">
          <button
            type="button"
            className="h-6 px-2 text-[10px]"
            aria-label={scale === "actual" ? "Use equal-width timing scale" : "Use actual-duration timing scale"}
            onClick={() => setScale((current) => current === "actual" ? "equal" : "actual")}
          >{scale === "actual" ? "Actual time" : "Equal width"}</button>
          <button type="button" className="h-6 w-6 rounded p-0 hover:bg-muted focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary" aria-label="Zoom timing overview out" onClick={() => setViewport((current) => zoomTimingViewport(current, 0.5, 0.5))}>−</button>
          <button type="button" className="h-6 w-6 rounded p-0 hover:bg-muted focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary" aria-label="Zoom timing overview in" onClick={() => setViewport((current) => zoomTimingViewport(current, 2, 0.5))}>+</button>
          <button type="button" className="h-6 rounded px-2 text-[10px] hover:bg-muted focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary" aria-label="Reset timing overview" onClick={() => setViewport({ zoom: 1, pan: 0 })}>Reset</button>
        </div>
      </div>
      {intervals.length === 0 ? (
        <div className="px-3 py-3 text-[11px] text-muted-foreground">No measured model, tool, approval, retry, compaction, subagent, or durability intervals are loaded.</div>
      ) : (
        <svg
          viewBox={`0 0 ${CHART_WIDTH} ${Math.max(LANE_HEIGHT, presentLanes.length * LANE_HEIGHT)}`}
          className="block w-full select-none"
          style={{ height: Math.max(48, presentLanes.length * LANE_HEIGHT) }}
          aria-label="Measured trajectory intervals"
          onContextMenu={(event) => event.preventDefault()}
          onWheel={(event) => {
            event.preventDefault();
            const rect = event.currentTarget.getBoundingClientRect();
            const anchor = rect.width <= 0 ? 0.5 : (event.clientX - rect.left) / rect.width;
            setViewport((current) => zoomTimingViewport(current, event.deltaY < 0 ? 1.25 : 0.8, anchor));
          }}
          onPointerDown={(event) => {
            if (event.button !== 0 && event.button !== 2) return;
            const x = localX(event);
            drag.current = { button: event.button, x, pan: viewport.pan };
            event.currentTarget.setPointerCapture?.(event.pointerId);
          }}
          onPointerMove={(event) => {
            const current = drag.current;
            if (!current || current.button !== 2) return;
            const delta = (current.x - localX(event)) / (CHART_WIDTH - LABEL_WIDTH);
            setViewport(panTimingViewport({ zoom: viewport.zoom, pan: current.pan }, delta));
          }}
          onPointerUp={(event) => finishSelection(localX(event))}
          onPointerCancel={() => { drag.current = null; }}
        >
          <defs><clipPath id="trajectory-timing-clip"><rect x={LABEL_WIDTH} y="0" width={CHART_WIDTH - LABEL_WIDTH} height="100%" /></clipPath></defs>
          {presentLanes.map((lane, laneIndex) => {
            const y = laneIndex * LANE_HEIGHT;
            return (
              <g key={lane.id}>
                <rect x="0" y={y} width={CHART_WIDTH} height={LANE_HEIGHT} className="fill-background even:fill-muted/20" />
                <text x="8" y={y + 16} className="fill-muted-foreground text-[10px] font-medium">{lane.label}</text>
                <line x1={LABEL_WIDTH} x2={CHART_WIDTH} y1={y + LANE_HEIGHT - 0.5} y2={y + LANE_HEIGHT - 0.5} className="stroke-border/50" />
              </g>
            );
          })}
          <g clipPath="url(#trajectory-timing-clip)">
            {positioned.map((entry) => {
              const laneIndex = presentLanes.findIndex((lane) => lane.id === entry.lane);
              if (laneIndex < 0) return null;
              const lane = LANES.find((candidate) => candidate.id === entry.lane)!;
              const label = `${entry.label}; ${entry.segment}; ${durationLabel(entry.start, entry.end)}`;
              return (
                <g
                  key={entry.id}
                  role="button"
                  tabIndex={0}
                  aria-label={label}
                  className={`${lane.color} cursor-pointer outline-none focus-visible:[&>rect]:stroke-primary focus-visible:[&>rect]:stroke-2`}
                  onClick={(event) => { event.stopPropagation(); onSelectRecords([entry.recordId]); }}
                  onKeyDown={(event) => {
                    if (event.key !== "Enter" && event.key !== " ") return;
                    event.preventDefault();
                    onSelectRecords([entry.recordId]);
                  }}
                >
                  <title>{label}</title>
                  <rect
                    x={LABEL_WIDTH + entry.x}
                    y={laneIndex * LANE_HEIGHT + 6}
                    width={Math.max(2, entry.width)}
                    height="12"
                    rx="2"
                    className={entry.live ? "fill-current opacity-90" : entry.segment === "result-commit" ? "fill-current opacity-35" : "fill-current opacity-75"}
                  />
                </g>
              );
            })}
          </g>
        </svg>
      )}
    </section>
  );
}
