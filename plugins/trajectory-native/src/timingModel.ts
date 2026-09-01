import type { SessionSeq, TrajectoryRecord } from "@termco/session-base";

export type TimingLane =
  | "model"
  | "tool"
  | "approval"
  | "retry"
  | "compaction"
  | "subagent"
  | "durability";

export type TimingScaleMode = "actual" | "equal";

export interface TimingInterval {
  readonly id: string;
  readonly recordId: string;
  readonly lane: TimingLane;
  readonly segment: string;
  readonly label: string;
  readonly start: number;
  readonly end?: number;
  readonly live: boolean;
  readonly sourceSeqs: readonly SessionSeq[];
}

export interface TimingViewport {
  readonly zoom: number;
  readonly pan: number;
}

export interface PositionedTimingInterval extends TimingInterval {
  readonly x: number;
  readonly width: number;
}

function object(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function eventType(record: TrajectoryRecord): string {
  return String(object(record.inspector).type ?? "");
}

function eventData(record: TrajectoryRecord): Record<string, unknown> {
  return object(object(record.inspector).data);
}

function eventTime(record: TrajectoryRecord): number {
  const time = object(record.inspector).time;
  return typeof time === "number" ? time : record.time.end ?? record.time.start;
}

function finite(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function interval(
  record: TrajectoryRecord,
  lane: TimingLane,
  segment: string,
  label: string,
  start: number,
  end?: number,
): TimingInterval {
  return Object.freeze({
    id: `${record.id}:${segment}`,
    recordId: record.id,
    lane,
    segment,
    label,
    start,
    ...(end === undefined ? {} : { end: Math.max(start, end) }),
    live: end === undefined,
    sourceSeqs: record.sourceSeqs,
  });
}

function matchingRecord(
  records: readonly TrajectoryRecord[],
  type: string,
  field: "requestId" | "callId",
  value: unknown,
): TrajectoryRecord | undefined {
  if (value === undefined) return undefined;
  return records.find((candidate) =>
    eventType(candidate) === type && eventData(candidate)[field] === value);
}

function requestIntervals(
  record: TrajectoryRecord,
  records: readonly TrajectoryRecord[],
): readonly TimingInterval[] {
  const requestId = eventData(record).requestId ?? record.nesting.requestId;
  const assistant = matchingRecord(records, "assistant/message", "requestId", requestId);
  const performance = object(eventData(assistant ?? record).performance);
  const start = finite(performance.requestStartedAt) ?? record.time.start;
  const end = finite(performance.endedAt) ?? record.time.end;
  const first = [
    performance.firstTextAt,
    performance.firstReasoningAt,
    performance.firstChunkAt,
    performance.firstByteAt,
  ].map(finite).find((value) => value !== undefined && value >= start && (end === undefined || value <= end));
  if (first === undefined) {
    return [interval(record, "model", "request", record.summary, start, end)];
  }
  return [
    interval(record, "model", "ttft", `${record.summary} · time to first token`, start, first),
    interval(record, "model", "decode", `${record.summary} · decode`, first, end),
  ];
}

function toolIntervals(
  record: TrajectoryRecord,
  records: readonly TrajectoryRecord[],
): readonly TimingInterval[] {
  const callId = eventData(record).callId ?? record.nesting.callId;
  const result = matchingRecord(records, "tool/result", "callId", callId);
  const timing = object(eventData(result ?? record).timing);
  const start = finite(timing.startedAt) ?? record.time.start;
  const end = finite(timing.endedAt) ?? record.time.end;
  const output = [interval(record, "tool", "body", record.summary, start, end)];
  if (result && end !== undefined) {
    const committedAt = eventTime(result);
    if (committedAt >= end) {
      output.push(interval(record, "tool", "result-commit", `${record.summary} · durable result`, end, committedAt));
    }
  }
  return output;
}

/** Derives only measured intervals. Open records remain points with no invented end. */
export function buildTimingIntervals(records: readonly TrajectoryRecord[]): readonly TimingInterval[] {
  const output: TimingInterval[] = [];
  for (const record of records) {
    const type = eventType(record);
    if (type === "request/header") {
      output.push(...requestIntervals(record, records));
      continue;
    }
    if (type === "tool/call") {
      output.push(...toolIntervals(record, records));
      continue;
    }
    if (type === "approval/request") {
      output.push(interval(record, "approval", "wait", record.summary, record.time.start, record.time.end));
      continue;
    }
    if (type === "retry/scheduled") {
      output.push(interval(record, "retry", "backoff", record.summary, record.time.start, record.time.end));
      continue;
    }
    if (type === "compaction/start") {
      output.push(interval(record, "compaction", "auxiliary-request", record.summary, record.time.start, record.time.end));
      continue;
    }
    if (type === "subagent/start") {
      output.push(interval(record, "subagent", "workflow", record.summary, record.time.start, record.time.end));
      continue;
    }
    if (type === "workspace/checkpoint") {
      output.push(interval(record, "durability", "checkpoint", record.summary, record.time.start, record.time.end));
    }
  }
  return Object.freeze(output.sort((left, right) => left.start - right.start || left.id.localeCompare(right.id)));
}

export function clampTimingViewport(viewport: TimingViewport): TimingViewport {
  const zoom = Math.min(16, Math.max(1, Number.isFinite(viewport.zoom) ? viewport.zoom : 1));
  const pan = Math.min(zoom - 1, Math.max(0, Number.isFinite(viewport.pan) ? viewport.pan : 0));
  return Object.freeze({ zoom, pan });
}

export function zoomTimingViewport(
  viewport: TimingViewport,
  factor: number,
  anchor: number,
): TimingViewport {
  const current = clampTimingViewport(viewport);
  const visibleAnchor = Math.min(1, Math.max(0, anchor));
  const domainAnchor = (current.pan + visibleAnchor) / current.zoom;
  const zoom = current.zoom * factor;
  return clampTimingViewport({ zoom, pan: domainAnchor * zoom - visibleAnchor });
}

export function panTimingViewport(viewport: TimingViewport, delta: number): TimingViewport {
  const current = clampTimingViewport(viewport);
  return clampTimingViewport({ zoom: current.zoom, pan: current.pan + delta });
}

function measuredDomain(intervals: readonly TimingInterval[]): { start: number; end: number } {
  if (intervals.length === 0) return { start: 0, end: 1 };
  const start = Math.min(...intervals.map((entry) => entry.start));
  const measuredEnds = intervals.flatMap((entry) => entry.end === undefined ? [] : [entry.end]);
  const end = Math.max(start + 1, ...measuredEnds, ...intervals.map((entry) => entry.start));
  return { start, end };
}

export function layoutTimingIntervals(
  intervals: readonly TimingInterval[],
  width: number,
  mode: TimingScaleMode,
  viewport: TimingViewport,
): readonly PositionedTimingInterval[] {
  const safeWidth = Math.max(1, width);
  const view = clampTimingViewport(viewport);
  const domain = measuredDomain(intervals);
  const span = domain.end - domain.start;
  const slot = intervals.length === 0 ? safeWidth : safeWidth / intervals.length;
  return Object.freeze(intervals.map((entry, index) => {
    const baseX = mode === "actual"
      ? (entry.start - domain.start) / span
      : index / Math.max(1, intervals.length);
    const baseWidth = entry.end === undefined
      ? 2 / safeWidth
      : mode === "actual"
        ? Math.max(2 / safeWidth, (entry.end - entry.start) / span)
        : Math.max(2 / safeWidth, slot * 0.72 / safeWidth);
    return Object.freeze({
      ...entry,
      x: (baseX * view.zoom - view.pan) * safeWidth,
      width: entry.end === undefined ? 2 : baseWidth * view.zoom * safeWidth,
    });
  }));
}

export function overlappingRecordIds(
  intervals: readonly TimingInterval[],
  start: number,
  end: number,
): readonly string[] {
  const from = Math.min(start, end);
  const to = Math.max(start, end);
  return Object.freeze([...new Set(intervals
    .filter((entry) => entry.start <= to && (entry.end ?? entry.start) >= from)
    .map((entry) => entry.recordId))]);
}

