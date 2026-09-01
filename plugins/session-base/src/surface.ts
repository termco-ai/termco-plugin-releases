import type { ParsedSessionEvent, SurfaceOp } from "./events";
import { SessionContractError } from "./errors";
import type { SessionSeq } from "./identity";

export type SurfaceClassification = "current" | "shadowed" | "log-only";

export interface ReplacementRangeValidationContext {
  readonly replacementSeq: SessionSeq;
  readonly replacementEvent: ParsedSessionEvent;
  readonly replacedSeqs: readonly SessionSeq[];
  readonly replacedEvents: readonly ParsedSessionEvent[];
  readonly eventsThroughReplacement: readonly ParsedSessionEvent[];
}

export interface FoldSurfaceOptions {
  /** Adds provider/plugin balance rules without exposing fold internals. */
  readonly validateReplacementRange?: (context: ReplacementRangeValidationContext) => void;
}

export interface SurfaceFoldResult {
  readonly currentSeqs: readonly SessionSeq[];
  readonly shadowedSeqs: readonly SessionSeq[];
  readonly logOnlySeqs: readonly SessionSeq[];
  readonly currentEvents: readonly ParsedSessionEvent[];
  readonly shadowedEvents: readonly ParsedSessionEvent[];
  readonly logOnlyEvents: readonly ParsedSessionEvent[];
  readonly classification: Readonly<Record<number, SurfaceClassification>>;
  readonly sourcesByDerived: Readonly<Record<number, readonly SessionSeq[]>>;
  readonly derivedBySource: Readonly<Record<number, readonly SessionSeq[]>>;
  /** Direct replacement edge: shadowed node -> replacement node. */
  readonly replacedBy: Readonly<Record<number, SessionSeq>>;
  /** Direct replacement edge: replacement node -> inclusive nodes it replaced. */
  readonly replaces: Readonly<Record<number, readonly SessionSeq[]>>;
}

interface SurfaceEnvelope {
  readonly surfaceOp: SurfaceOp;
  readonly sourceEventSeqs?: readonly SessionSeq[];
}

function surfaceFailure(seq: number, path: string, message: string, cause?: unknown): never {
  throw new SessionContractError({
    code: "INVALID_SURFACE",
    message: `seq ${seq} surface fold failed: ${message}`,
    path: `events[${seq}].${path}`,
    cause,
  });
}

function directSources(event: ParsedSessionEvent): readonly SessionSeq[] {
  const envelopeSources = (event as ParsedSessionEvent & { sourceEventSeqs?: readonly SessionSeq[] })
    .sourceEventSeqs;
  const dataSources =
    typeof event.data === "object" &&
    event.data !== null &&
    !Array.isArray(event.data) &&
    "sourceEventSeqs" in event.data &&
    Array.isArray(event.data.sourceEventSeqs)
      ? (event.data.sourceEventSeqs as readonly SessionSeq[])
      : undefined;
  return envelopeSources ?? dataSources ?? [];
}

function readonlyRecord<T>(entries: Iterable<readonly [number, T]>): Readonly<Record<number, T>> {
  return Object.freeze(Object.fromEntries(entries)) as Readonly<Record<number, T>>;
}

/**
 * Builds the complete surface and direct causal indexes from validated events.
 * Raw events remain untouched; every output edge refers to a committed sequence.
 */
export function foldSurface(
  events: readonly ParsedSessionEvent[],
  options: FoldSurfaceOptions = {},
): SurfaceFoldResult {
  const eventsBySeq = new Map<number, ParsedSessionEvent>();
  const current: ParsedSessionEvent[] = [];
  const shadowed = new Map<number, ParsedSessionEvent>();
  const logOnly: ParsedSessionEvent[] = [];
  const classification = new Map<number, SurfaceClassification>();
  const sourcesByDerived = new Map<number, readonly SessionSeq[]>();
  const derivedBySource = new Map<number, SessionSeq[]>();
  const replacedBy = new Map<number, SessionSeq>();
  const replaces = new Map<number, readonly SessionSeq[]>();
  let previousSeq = -1;

  for (const [eventIndex, event] of events.entries()) {
    const seq = event.seq as number;
    if (!Number.isSafeInteger(seq) || seq < 0) {
      surfaceFailure(seq, "seq", "sequence must be a non-negative safe integer");
    }
    if (seq <= previousSeq) {
      surfaceFailure(seq, "seq", `events must be strictly ordered; previous sequence is ${previousSeq}`);
    }
    if (eventsBySeq.has(seq)) surfaceFailure(seq, "seq", "duplicate sequence");

    const sources = directSources(event);
    const seenSources = new Set<number>();
    for (const [sourceIndex, brandedSource] of sources.entries()) {
      const source = brandedSource as number;
      if (seenSources.has(source)) {
        surfaceFailure(seq, `sourceEventSeqs[${sourceIndex}]`, `duplicate source sequence ${source}`);
      }
      if (source >= seq) {
        surfaceFailure(seq, `sourceEventSeqs[${sourceIndex}]`, `source sequence ${source} must precede its derived event`);
      }
      if (!eventsBySeq.has(source)) {
        surfaceFailure(seq, `sourceEventSeqs[${sourceIndex}]`, `source sequence ${source} is absent from the fold input`);
      }
      seenSources.add(source);
      const derived = derivedBySource.get(source) ?? [];
      derived.push(event.seq);
      derivedBySource.set(source, derived);
    }
    if (sources.length > 0) sourcesByDerived.set(seq, Object.freeze([...sources]));

    const envelope = event as ParsedSessionEvent & Partial<SurfaceEnvelope>;
    if (envelope.surfaceOp === undefined) {
      logOnly.push(event);
      classification.set(seq, "log-only");
    } else if (envelope.surfaceOp.op === "append") {
      if (event.type === "compaction/message") {
        surfaceFailure(seq, "surfaceOp", "compaction/message must replace an existing current range");
      }
      current.push(event);
      classification.set(seq, "current");
    } else {
      const start = envelope.surfaceOp.start as number;
      const end = envelope.surfaceOp.end as number;
      const startIndex = current.findIndex((candidate) => (candidate.seq as number) === start);
      if (startIndex < 0) {
        surfaceFailure(seq, "surfaceOp.start", `replacement start ${start} is not a current surface node`);
      }
      const endIndex = current.findIndex((candidate) => (candidate.seq as number) === end);
      if (endIndex < 0) {
        surfaceFailure(seq, "surfaceOp.end", `replacement end ${end} is not a current surface node`);
      }
      if (startIndex > endIndex) {
        surfaceFailure(seq, "surfaceOp", `replacement endpoints are reversed in the current surface`);
      }

      const replacedEvents = current.slice(startIndex, endIndex + 1);
      for (const replacedEvent of replacedEvents) {
        const replacedSeq = replacedEvent.seq as number;
        if (!seenSources.has(replacedSeq)) {
          surfaceFailure(
            seq,
            "sourceEventSeqs",
            `replacement citations are missing replaced sequence ${replacedSeq}`,
          );
        }
      }

      const context: ReplacementRangeValidationContext = {
        replacementSeq: event.seq,
        replacementEvent: event,
        replacedSeqs: Object.freeze(replacedEvents.map((candidate) => candidate.seq)),
        replacedEvents: Object.freeze([...replacedEvents]),
        eventsThroughReplacement: Object.freeze([...events.slice(0, eventIndex + 1)]),
      };
      try {
        options.validateReplacementRange?.(context);
      } catch (error) {
        if (error instanceof SessionContractError) throw error;
        surfaceFailure(
          seq,
          "surfaceOp",
          `replacement range balance hook rejected the range: ${
            error instanceof Error ? error.message : String(error)
          }`,
          error,
        );
      }

      for (const replacedEvent of replacedEvents) {
        const replacedSeq = replacedEvent.seq as number;
        shadowed.set(replacedSeq, replacedEvent);
        classification.set(replacedSeq, "shadowed");
        replacedBy.set(replacedSeq, event.seq);
      }
      replaces.set(seq, context.replacedSeqs);
      current.splice(startIndex, replacedEvents.length, event);
      classification.set(seq, "current");
    }

    eventsBySeq.set(seq, event);
    previousSeq = seq;
  }

  const shadowedEvents = [...shadowed.values()].sort(
    (left, right) => (left.seq as number) - (right.seq as number),
  );
  return Object.freeze({
    currentSeqs: Object.freeze(current.map((event) => event.seq)),
    shadowedSeqs: Object.freeze(shadowedEvents.map((event) => event.seq)),
    logOnlySeqs: Object.freeze(logOnly.map((event) => event.seq)),
    currentEvents: Object.freeze([...current]),
    shadowedEvents: Object.freeze(shadowedEvents),
    logOnlyEvents: Object.freeze([...logOnly]),
    classification: readonlyRecord(classification.entries()),
    sourcesByDerived: readonlyRecord(sourcesByDerived.entries()),
    derivedBySource: readonlyRecord(
      [...derivedBySource.entries()].map(([source, derived]) => [source, Object.freeze([...derived])] as const),
    ),
    replacedBy: readonlyRecord(replacedBy.entries()),
    replaces: readonlyRecord(replaces.entries()),
  });
}
