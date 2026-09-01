import type { SessionSeq } from "./identity";
import type { ImmutableJson } from "./json";

/**
 * Plugins augment this map with their owned event payloads. Runtime validation
 * remains mandatory because TypeScript declarations cannot validate persisted data.
 */
export interface SessionEventMap {}

/** Event-map keys present here require an envelope-level surface operation. */
export interface SessionSurfaceEventMap {}

export type SessionEventType = keyof SessionEventMap & string;

export type SurfaceOp =
  | { readonly op: "append" }
  | {
      readonly op: "replace";
      readonly start: SessionSeq;
      readonly end: SessionSeq;
    };

export interface SurfaceIntent {
  readonly surfaceOp: SurfaceOp;
  readonly sourceEventSeqs?: readonly SessionSeq[];
}

type SurfaceFields<TType extends SessionEventType> =
  TType extends keyof SessionSurfaceEventMap
    ? SurfaceIntent
    : {
        readonly surfaceOp?: never;
        readonly sourceEventSeqs?: never;
      };

/** A committed, immutable event. Only a session owner may allocate `seq`. */
export type SessionEvent<
  TType extends SessionEventType = SessionEventType,
> = {
  readonly [TEventType in TType]: {
    readonly type: TEventType;
    readonly seq: SessionSeq;
    readonly time: number;
    readonly data: ImmutableJson<SessionEventMap[TEventType]>;
    readonly ignorable?: true;
  } & SurfaceFields<TEventType>;
}[TType];

/** Public append input. A live caller cannot supply the store-owned sequence. */
export type AppendSessionEvent<
  TType extends SessionEventType = SessionEventType,
> = {
  readonly [TEventType in TType]: Omit<SessionEvent<TEventType>, "seq">;
}[TType];

/** Raw informational data preserved when its optional plugin reader is absent. */
export interface UnknownIgnorableSessionEvent {
  readonly type: string;
  readonly seq: SessionSeq;
  readonly time: number;
  readonly data: import("./json").JsonValue;
  readonly ignorable: true;
}

export type ParsedSessionEvent = SessionEvent | UnknownIgnorableSessionEvent;
