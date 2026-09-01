import type { TrajectoryRecord } from "@termco/session-base";
import { describe, expect, it } from "vitest";
import {
  buildTimingIntervals,
  clampTimingViewport,
  layoutTimingIntervals,
  overlappingRecordIds,
  panTimingViewport,
  zoomTimingViewport,
} from "./timingModel";

function record(input: Partial<TrajectoryRecord> & Pick<TrajectoryRecord, "id" | "kind">): TrajectoryRecord {
  return {
    id: input.id,
    kind: input.kind,
    sourceSeqs: input.sourceSeqs ?? [],
    time: input.time ?? { start: 0 },
    status: input.status ?? "completed",
    nesting: input.nesting ?? {},
    summary: input.summary ?? input.id,
    searchableText: input.searchableText ?? input.id,
    inspector: input.inspector ?? {},
    ...(input.metrics === undefined ? {} : { metrics: input.metrics }),
  };
}

describe("current trajectory timing overview", () => {
  it("derives TTFT and decode segments from the canonical request performance", () => {
    const intervals = buildTimingIntervals([
      record({
        id: "request",
        kind: "request",
        time: { start: 100, end: 240 },
        nesting: { requestId: "req-1" as never },
        inspector: { type: "request/header", data: { requestId: "req-1" } },
      }),
      record({
        id: "assistant",
        kind: "assistant/response",
        time: { start: 240, end: 240 },
        nesting: { requestId: "req-1" as never },
        inspector: {
          type: "assistant/message",
          time: 240,
          data: {
            requestId: "req-1",
            performance: {
              requestStartedAt: 100,
              firstTextAt: 160,
              endedAt: 240,
            },
          },
        },
      }),
    ]);

    expect(intervals.map(({ lane, segment, start, end }) => ({ lane, segment, start, end }))).toEqual([
      { lane: "model", segment: "ttft", start: 100, end: 160 },
      { lane: "model", segment: "decode", start: 160, end: 240 },
    ]);
  });

  it("separates tool body time from durable result commit delay", () => {
    const intervals = buildTimingIntervals([
      record({
        id: "call",
        kind: "tool",
        time: { start: 300, end: 390 },
        nesting: { callId: "call-1" as never },
        inspector: { type: "tool/call", time: 290, data: { callId: "call-1", name: "files.write" } },
      }),
      record({
        id: "result",
        kind: "tool",
        time: { start: 390, end: 390 },
        nesting: { callId: "call-1" as never },
        inspector: {
          type: "tool/result",
          time: 410,
          data: { callId: "call-1", timing: { startedAt: 300, endedAt: 390 } },
        },
      }),
    ]);

    expect(intervals.map(({ segment, start, end }) => ({ segment, start, end }))).toEqual([
      { segment: "body", start: 300, end: 390 },
      { segment: "result-commit", start: 390, end: 410 },
    ]);
  });

  it("does not invent an end or duration for an in-flight record", () => {
    const intervals = buildTimingIntervals([
      record({
        id: "approval",
        kind: "approval",
        time: { start: 500 },
        status: "running",
        inspector: { type: "approval/request", data: { approvalId: "approval-1" } },
      }),
    ]);

    expect(intervals).toHaveLength(1);
    expect(intervals[0]).toMatchObject({ lane: "approval", start: 500, live: true });
    expect(intervals[0]).not.toHaveProperty("end");
    expect(layoutTimingIntervals(intervals, 800, "actual", { zoom: 1, pan: 0 })[0]).toMatchObject({ width: 2 });
  });

  it("maps actual time deterministically and gives every interval equal width in equal mode", () => {
    const intervals = [
      { id: "a", recordId: "a", lane: "model", segment: "request", label: "a", start: 0, end: 10, live: false, sourceSeqs: [] },
      { id: "b", recordId: "b", lane: "tool", segment: "body", label: "b", start: 20, end: 100, live: false, sourceSeqs: [] },
    ] as const;

    const actual = layoutTimingIntervals(intervals, 100, "actual", { zoom: 1, pan: 0 });
    expect(actual.map(({ x, width }) => ({ x, width }))).toEqual([
      { x: 0, width: 10 },
      { x: 20, width: 80 },
    ]);

    const equal = layoutTimingIntervals(intervals, 100, "equal", { zoom: 1, pan: 0 });
    expect(equal[0]?.width).toBe(equal[1]?.width);
    expect(equal[0]?.x).toBeLessThan(equal[1]?.x ?? 0);
  });

  it("uses inclusive overlap so boundary selections focus every touching record", () => {
    const intervals = [
      { id: "a", recordId: "request", lane: "model", segment: "request", label: "a", start: 0, end: 10, live: false, sourceSeqs: [] },
      { id: "b", recordId: "tool", lane: "tool", segment: "body", label: "b", start: 10, end: 20, live: false, sourceSeqs: [] },
      { id: "c", recordId: "live", lane: "approval", segment: "wait", label: "c", start: 20, live: true, sourceSeqs: [] },
    ] as const;

    expect(overlappingRecordIds(intervals, 10, 10)).toEqual(["request", "tool"]);
    expect(overlappingRecordIds(intervals, 20, 20)).toEqual(["tool", "live"]);
  });

  it("clamps zoom and pan and preserves the cursor anchor while zooming", () => {
    expect(clampTimingViewport({ zoom: 99, pan: 99 })).toEqual({ zoom: 16, pan: 15 });
    expect(clampTimingViewport({ zoom: 0, pan: -1 })).toEqual({ zoom: 1, pan: 0 });

    const zoomed = zoomTimingViewport({ zoom: 1, pan: 0 }, 2, 0.75);
    expect(zoomed).toEqual({ zoom: 2, pan: 0.75 });
    expect(panTimingViewport(zoomed, 10)).toEqual({ zoom: 2, pan: 1 });
    expect(panTimingViewport(zoomed, -10)).toEqual({ zoom: 2, pan: 0 });
  });
});
