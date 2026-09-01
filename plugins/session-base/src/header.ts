import type { SessionId, SessionSeq } from "./identity";
import type { SESSION_FORMAT_VERSION } from "./version";

export type SessionAuthority = "v2";

export type SessionFidelity = "full" | "adapter";

export type SessionOrigin =
  | "user"
  | "compaction"
  | "fork"
  | "rerun"
  | "subagent";

/** Immutable identity and provenance written before a session's first event. */
export interface SessionHeader {
  readonly formatVersion: typeof SESSION_FORMAT_VERSION;
  readonly id: SessionId;
  readonly createdAt: number;
  readonly authority: SessionAuthority;
  readonly backend: string;
  readonly fidelity: SessionFidelity;
  readonly rigId?: string;
  readonly workspace?: {
    readonly rootHash: string;
    /** Local persistence only. Export and model-facing projections must redact it. */
    readonly rootPath?: string;
  };
  readonly parent?: {
    readonly sessionId: SessionId;
    readonly boundarySeq: SessionSeq;
    readonly seedLength: number;
  };
  readonly origin?: SessionOrigin;
  readonly delegationDepth?: number;
  readonly agentComposition?: {
    readonly presetId?: string;
    readonly profileRevision?: string;
  };
}
