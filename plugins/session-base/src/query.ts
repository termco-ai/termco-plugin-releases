import type { ParsedSessionEvent } from "./events";
import type { SessionId, SessionSeq } from "./identity";
import type { JsonValue } from "./json";
import type { SessionQueryPage } from "./projections";

export interface SessionQueryRequest {
  readonly text: string;
  /** Host-owned cancellation only; model tool schemas must not expose it. */
  readonly signal?: AbortSignal;
  readonly cursor?: string;
  readonly limit?: number;
  readonly workspaceRootHash?: string;
  readonly rigId?: string;
  readonly backend?: string;
  readonly eventTypes?: readonly string[];
  readonly surface?: "current" | "shadowed" | "log-only";
}

export interface SessionEventExplanation {
  readonly event: ParsedSessionEvent;
  readonly sources: readonly SessionSeq[];
  readonly derived: readonly SessionSeq[];
}

/** Semantic current-format query seam. Implementations index projections, never storage files. */
export interface SessionQueryCapability {
  search(request: SessionQueryRequest): Promise<SessionQueryPage>;
  readEvent(sessionId: SessionId, seq: SessionSeq): Promise<ParsedSessionEvent | null>;
  explainEvent(
    sessionId: SessionId,
    seq: SessionSeq,
  ): Promise<SessionEventExplanation | null>;
}

/** Host-derived caller identity for model-facing query. Tool input must never supply it. */
export interface SessionModelQueryContext {
  readonly callerSessionId: SessionId;
  readonly signal?: AbortSignal;
}

export interface SessionModelSearchRequest extends SessionModelQueryContext {
  readonly text: string;
  readonly targetSessionId?: SessionId;
}

export interface SessionModelEventRequest extends SessionModelQueryContext {
  readonly sessionId: SessionId;
  readonly seq: SessionSeq;
}

export interface SessionModelTraceRequest extends SessionModelQueryContext {
  readonly sessionId: SessionId;
}

export interface SessionModelRedactionReport {
  readonly count: number;
  readonly categories: readonly string[];
  readonly truncated: boolean;
}

export interface SessionModelSearchResult {
  readonly sessionId: SessionId;
  readonly eventSeq?: SessionSeq;
  readonly stableId: string;
  readonly summary: string;
  readonly matchedText: string;
}

export interface SessionModelSearchPage {
  readonly results: readonly SessionModelSearchResult[];
  readonly redaction: SessionModelRedactionReport;
  readonly truncated: boolean;
}

export interface SessionModelEvent {
  readonly type: string;
  readonly seq: SessionSeq;
  readonly time: number;
  readonly data: JsonValue;
}

export interface SessionModelEventResult {
  readonly event: SessionModelEvent;
  readonly redaction: SessionModelRedactionReport;
}

export interface SessionModelEventExplanationResult extends SessionModelEventResult {
  readonly sources: readonly SessionSeq[];
  readonly derived: readonly SessionSeq[];
}

export interface SessionModelTraceResult {
  readonly sessionId: SessionId;
  readonly parentSessionId?: SessionId;
  readonly childSessionIds: readonly SessionId[];
  readonly redaction: SessionModelRedactionReport;
  readonly truncated: boolean;
}

/** Caller-bound, redacted, fixed-budget seam for optional model tool plugins. */
export interface SessionModelQueryCapability {
  search(request: SessionModelSearchRequest): Promise<SessionModelSearchPage>;
  traceSession(request: SessionModelTraceRequest): Promise<SessionModelTraceResult | null>;
  readEvent(request: SessionModelEventRequest): Promise<SessionModelEventResult | null>;
  explainEvent(
    request: SessionModelEventRequest,
  ): Promise<SessionModelEventExplanationResult | null>;
}
