import { describe, expect, it, vi } from "vitest";
import {
  foldSurface,
  parseSessionEvent,
  type ParsedSessionEvent,
} from "./index";

const time = 1_777_777_777_777;

function event(
  type: string,
  seq: number,
  data: Record<string, unknown>,
  extra: Record<string, unknown> = {},
): ParsedSessionEvent {
  return parseSessionEvent({ type, seq, time: time + seq, data, ...extra });
}

function user(seq: number, content: string): ParsedSessionEvent {
  return event(
    "user/message",
    seq,
    { turn: 1, message: { role: "user", content }, source: "human" },
    { surfaceOp: { op: "append" } },
  );
}

function assistant(seq: number, content: string): ParsedSessionEvent {
  return event(
    "assistant/message",
    seq,
    {
      turn: 1,
      step: 1,
      requestId: "request-1",
      message: { role: "assistant", content },
      finishReason: "stop",
    },
    { surfaceOp: { op: "append" }, sourceEventSeqs: [] },
  );
}

function toolResult(seq: number): ParsedSessionEvent {
  return event(
    "tool/result",
    seq,
    {
      turn: 1,
      step: 1,
      callId: "call-1",
      canonicalOutput: { value: 4 },
      modelContent: { role: "tool", content: "4" },
    },
    { surfaceOp: { op: "append" }, sourceEventSeqs: [] },
  );
}

function compaction(
  startSeq: number,
  range: readonly [number, number],
  sources: readonly number[],
): readonly ParsedSessionEvent[] {
  const [start, end] = range;
  return [
    event("compaction/start", startSeq, {
      compactionId: `compact-${startSeq}`,
      trigger: "automatic",
      measuredTokens: 90_000,
      candidate: { start, end },
      policyRevision: "1",
    }),
    event("compaction/summary", startSeq + 1, {
      compactionId: `compact-${startSeq}`,
      request: { modelId: "summary-model" },
      summary: { text: "summary" },
    }),
    event(
      "compaction/message",
      startSeq + 2,
      { compactionId: `compact-${startSeq}`, content: { text: "summary" } },
      {
        surfaceOp: { op: "replace", start, end },
        sourceEventSeqs: sources,
      },
    ),
    event("compaction/end", startSeq + 3, {
      compactionId: `compact-${startSeq}`,
      outcome: "succeeded",
    }),
  ];
}

describe("foldSurface", () => {
  it("folds append nodes while classifying non-surface events as log-only", () => {
    const events = [
      event("turn/start", 0, { turn: 1, cause: "user" }),
      user(1, "two plus two"),
      assistant(2, "calling calculator"),
      toolResult(3),
    ];

    const surface = foldSurface(events);

    expect(surface.currentSeqs).toEqual([1, 2, 3]);
    expect(surface.shadowedSeqs).toEqual([]);
    expect(surface.logOnlySeqs).toEqual([0]);
    expect(surface.classification).toEqual({ 0: "log-only", 1: "current", 2: "current", 3: "current" });
  });

  it("preserves raw nodes across two replacements and indexes causality", () => {
    const firstRound = [user(0, "question"), assistant(1, "answer"), toolResult(2)];
    const firstCompaction = compaction(3, [0, 2], [0, 1, 2, 3, 4]);
    const followup = user(7, "follow up");
    const secondCompaction = compaction(8, [5, 7], [5, 7, 8, 9]);
    const events = [...firstRound, ...firstCompaction, followup, ...secondCompaction];

    const surface = foldSurface(events);

    expect(surface.currentSeqs).toEqual([10]);
    expect(surface.shadowedSeqs).toEqual([0, 1, 2, 5, 7]);
    expect(surface.logOnlySeqs).toEqual([3, 4, 6, 8, 9, 11]);
    expect(surface.sourcesByDerived[5]).toEqual([0, 1, 2, 3, 4]);
    expect(surface.derivedBySource[0]).toEqual([5]);
    expect(surface.derivedBySource[5]).toEqual([10]);
    expect(surface.replacedBy[0]).toBe(5);
    expect(surface.replacedBy[5]).toBe(10);
    expect(surface.replaces[10]).toEqual([5, 7]);
  });

  it("rejects missing replacement citations, shadowed endpoints, and absent sources deterministically", () => {
    const base = [user(0, "question"), assistant(1, "answer"), toolResult(2)];
    const missingCitation = compaction(3, [0, 2], [0, 1, 3, 4]);

    expect(() => foldSurface([...base, ...missingCitation])).toThrowError(
      expect.objectContaining({
        code: "INVALID_SURFACE",
        path: "events[5].sourceEventSeqs",
        message: expect.stringContaining("missing replaced sequence 2"),
      }),
    );

    const valid = compaction(3, [0, 2], [0, 1, 2, 3, 4]);
    const replaceShadowed = compaction(7, [0, 2], [0, 1, 2, 7, 8]);
    expect(() => foldSurface([...base, ...valid, ...replaceShadowed])).toThrowError(
      expect.objectContaining({ code: "INVALID_SURFACE", path: "events[9].surfaceOp.start" }),
    );

    const absentSource = {
      ...assistant(2, "answer after missing event"),
      sourceEventSeqs: [1],
    } as unknown as ParsedSessionEvent;
    expect(() => foldSurface([user(0, "question"), absentSource])).toThrowError(
      expect.objectContaining({ code: "INVALID_SURFACE", path: "events[2].sourceEventSeqs[0]" }),
    );

    expect(() =>
      parseSessionEvent({
        ...assistant(2, "duplicate source"),
        sourceEventSeqs: [0, 0],
      }),
    ).toThrowError(expect.objectContaining({ code: "INVALID_EVENT", path: "event.sourceEventSeqs[1]" }));
    expect(() =>
      parseSessionEvent({
        ...assistant(2, "future source"),
        sourceEventSeqs: [3],
      }),
    ).toThrowError(expect.objectContaining({ code: "INVALID_EVENT", path: "event.sourceEventSeqs[0]" }));
  });

  it("invokes the replacement-range balance hook with the current inclusive range", () => {
    const validateReplacementRange = vi.fn();
    const base = [user(0, "question"), assistant(1, "answer"), toolResult(2)];
    const compact = compaction(3, [0, 2], [0, 1, 2, 3, 4]);

    foldSurface([...base, ...compact], { validateReplacementRange });

    expect(validateReplacementRange).toHaveBeenCalledOnce();
    expect(validateReplacementRange.mock.calls[0]?.[0]).toMatchObject({
      replacementSeq: 5,
      replacedSeqs: [0, 1, 2],
    });
  });
});
