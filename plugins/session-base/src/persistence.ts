import type { AppendSessionEvent, ParsedSessionEvent } from "./events";
import type { SessionHeader } from "./header";
import type { SessionId, SessionRevision, SessionSeq } from "./identity";
import type { ForkSessionInput, ForkSessionResult, SessionWindow } from "./projections";

/**
 * `memory` is visible to the active owner and is drained by flush/dispose;
 * `written` has completed the filesystem write but not an OS sync; `flushed`
 * has completed the adapter's OS-level sync contract.
 */
export type SessionDurability = "memory" | "written" | "flushed";

export interface CreateSessionInput {
  readonly header: SessionHeader;
  readonly seed?: readonly AppendSessionEvent[];
  readonly durability?: SessionDurability;
}

export interface SessionSnapshot {
  readonly header: SessionHeader;
  readonly revision: SessionRevision;
  readonly tailSeq?: SessionSeq;
}

export interface AppendSessionOptions {
  readonly expectedRevision?: SessionRevision;
  readonly expectedTailSeq?: SessionSeq;
  readonly durability?: SessionDurability;
}

export interface CommittedSessionRange {
  readonly sessionId: SessionId;
  readonly firstSeq: SessionSeq;
  readonly lastSeq: SessionSeq;
  readonly revision: SessionRevision;
  readonly durability: SessionDurability;
}

export type SessionWindowRequest =
  | { readonly kind: "tail"; readonly limit: number }
  | { readonly kind: "head"; readonly limit: number }
  | { readonly kind: "before"; readonly seq: SessionSeq; readonly limit: number }
  | { readonly kind: "after"; readonly seq: SessionSeq; readonly limit: number }
  | { readonly kind: "range"; readonly start: SessionSeq; readonly end: SessionSeq };

export interface SessionInspection {
  readonly sessionId: SessionId;
  readonly state:
    | "healthy"
    | "waiting-input"
    | "open-tail"
    | "repairable-tail"
    | "corrupt-prefix"
    | "unsupported-format";
  readonly revision?: SessionRevision;
  readonly tailSeq?: SessionSeq;
  readonly safeThroughSeq?: SessionSeq;
  readonly proposedRepair?: readonly AppendSessionEvent[];
  readonly message?: string;
}

export interface ListSessionsRequest {
  readonly cursor?: string;
  readonly limit?: number;
  readonly rigId?: string;
  readonly workspaceRootHash?: string;
}

export interface SessionListing {
  readonly sessionId: SessionId;
  readonly createdAt: number;
  readonly updatedAt: number;
  readonly rigId?: string;
  readonly backend: string;
  readonly fidelity: SessionHeader["fidelity"];
  readonly revision: SessionRevision;
  readonly tailSeq?: SessionSeq;
  readonly title?: string;
  readonly parentSessionId?: SessionId;
  readonly pinned?: boolean;
  readonly health: SessionInspection["state"];
}

export interface SessionListingPage {
  readonly sessions: readonly SessionListing[];
  readonly cursor?: string;
  readonly exhausted: boolean;
}

export interface SessionCommit {
  readonly sessionId: SessionId;
  readonly events: readonly ParsedSessionEvent[];
  readonly revision: SessionRevision;
  readonly tailSeq: SessionSeq;
  readonly durability: SessionDurability;
}

export type DisposeSessionSubscription = () => void;

export interface RemoveSessionOptions {
  readonly expectedRevision?: SessionRevision;
}

export type SessionRetentionProtection =
  | "active"
  | "open"
  | "pinned"
  | "recent"
  | "referenced";

/** Age-based current-format retention intent. The history owner resolves protection and lineage. */
export interface SessionRetentionPolicy {
  readonly deleteUpdatedBefore: number;
  readonly activeSessionIds?: readonly SessionId[];
  readonly dryRun?: boolean;
}

export interface SessionRetentionDecision {
  readonly sessionId: SessionId;
  readonly protections: readonly SessionRetentionProtection[];
}

export interface SessionRetentionReport {
  readonly protected: readonly SessionRetentionDecision[];
  readonly eligibleSessionIds: readonly SessionId[];
  readonly removedSessionIds: readonly SessionId[];
}

/** Public intent-oriented session history capability. Sequence allocation stays inside its provider. */
export interface SessionHistoryCapability {
  create(input: CreateSessionInput): Promise<SessionSnapshot>;
  append(
    sessionId: SessionId,
    events: readonly AppendSessionEvent[],
    options?: AppendSessionOptions,
  ): Promise<CommittedSessionRange>;
  readWindow(sessionId: SessionId, request: SessionWindowRequest): Promise<SessionWindow>;
  inspect(sessionId: SessionId): Promise<SessionInspection>;
  loadForContinuation(sessionId: SessionId): Promise<SessionWindow>;
  flush(sessionId: SessionId): Promise<SessionRevision>;
  fork(input: ForkSessionInput): Promise<ForkSessionResult>;
  remove(sessionId: SessionId, options?: RemoveSessionOptions): Promise<void>;
  enforceRetention(policy: SessionRetentionPolicy): Promise<SessionRetentionReport>;
  list(request?: ListSessionsRequest): Promise<SessionListingPage>;
  subscribe(sessionId: SessionId, listener: (commit: SessionCommit) => void): DisposeSessionSubscription;
}

export interface PrepareSessionInput {
  readonly header: SessionHeader;
  readonly seed?: readonly ParsedSessionEvent[];
  readonly durability: SessionDurability;
}

export interface PreparedSession {
  readonly header: SessionHeader;
  readonly revision: SessionRevision;
  readonly tailSeq?: SessionSeq;
}

export interface DurableAppendInput {
  readonly sessionId: SessionId;
  readonly events: readonly ParsedSessionEvent[];
  readonly expectedRevision: SessionRevision;
  readonly expectedTailSeq?: SessionSeq;
  readonly durability: SessionDurability;
}

export interface DurableAppendResult {
  readonly revision: SessionRevision;
  readonly tailSeq: SessionSeq;
  readonly durability: SessionDurability;
}

export interface PersistenceWindowRequest {
  readonly sessionId: SessionId;
  readonly window: SessionWindowRequest;
}

export interface PersistenceInspection {
  readonly header?: SessionHeader;
  readonly events: readonly ParsedSessionEvent[];
  readonly inspection: SessionInspection;
  readonly uncommittedTail?: {
    readonly committedByteLength: number;
    readonly observedByteLength: number;
  };
}

export interface DiscardUncommittedTailInput {
  readonly sessionId: SessionId;
  readonly expectedRevision: SessionRevision;
  readonly committedByteLength: number;
  readonly observedByteLength: number;
}

export interface RemoveSessionInput {
  readonly sessionId: SessionId;
  readonly expectedRevision?: SessionRevision;
}

/** Internal adapter seam. It persists already validated, owner-sequenced events and knows no Chat behavior. */
export interface SessionPersistenceAdapter {
  prepare(input: PrepareSessionInput): Promise<PreparedSession>;
  append(input: DurableAppendInput): Promise<DurableAppendResult>;
  readWindow(input: PersistenceWindowRequest): Promise<SessionWindow>;
  inspect(sessionId: SessionId): Promise<PersistenceInspection>;
  discardUncommittedTail(input: DiscardUncommittedTailInput): Promise<void>;
  flush(sessionId: SessionId): Promise<SessionRevision>;
  list(request?: ListSessionsRequest): Promise<SessionListingPage>;
  remove(input: RemoveSessionInput): Promise<void>;
  dispose(): Promise<void>;
}
