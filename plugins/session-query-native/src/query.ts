import {
  SessionId,
  SessionSeq,
  foldSurface,
  projectCanonicalSession,
  type ParsedSessionEvent,
  type SessionHistoryCapability,
  type JsonValue,
  type SessionModelEventResult,
  type SessionModelQueryCapability,
  type SessionModelRedactionReport,
  type SessionModelSearchResult,
  type SessionQueryCapability,
  type SessionQueryRequest,
  type SessionQueryResult,
  type SessionWindow,
} from "@termco/session-base";

const SESSION_PAGE_SIZE = 50;
const EVENT_PAGE_SIZE = 256;
const DEFAULT_RESULT_LIMIT = 50;
const MAX_RESULT_LIMIT = 500;
const MAX_SESSION_PAGES = 10_000;
const MAX_EVENT_PAGES = 10_000;
const MODEL_RESULT_LIMIT = 8;
const MODEL_SCAN_RESULT_LIMIT = 64;
const MODEL_SESSION_PAGE_LIMIT = 20;
const MODEL_EVENT_PAGE_LIMIT = 64;
const MODEL_EVENT_CHAR_LIMIT = 12_000;
const MODEL_STRING_CHAR_LIMIT = 2_048;
const MODEL_SEARCH_TEXT_CHAR_LIMIT = 900;
const MODEL_IDENTIFIER_CHAR_LIMIT = 160;
const MODEL_COLLECTION_LIMIT = 40;

const MODEL_REDACTABLE_EVENT_TYPES = new Set([
  "session/end-seed",
  "session/title",
  "session/policy",
  "session/pin",
  "session/label",
  "session/rig",
  "turn/start",
  "turn/end",
  "step/start",
  "step/end",
  "user/message",
  "context/injected",
  "request/header",
  "request/context",
  "request/attempt",
  "request/failure",
  "assistant/chunk",
  "assistant/message",
  "tool/call",
  "approval/request",
  "approval/decision",
  "tool/result",
  "retry/scheduled",
  "retry/started",
  "retry/cancelled",
  "compaction/start",
  "compaction/summary",
  "compaction/message",
  "compaction/end",
  "workspace/checkpoint",
  "subagent/start",
  "subagent/report",
  "subagent/end",
  "adapter/event",
]);

const SECRET_PATTERNS = [
  /\bsk-(?:proj-)?[A-Za-z0-9_-]{20,}\b/g,
  /\bsk-ant-[A-Za-z0-9_-]{20,}\b/g,
  /\b(?:AKIA|ASIA)[0-9A-Z]{16}\b/g,
  /\bgh[opsur]_[A-Za-z0-9]{36,}\b/g,
  /\bgithub_pat_[A-Za-z0-9_]{40,}\b/g,
  /\bAIza[0-9A-Za-z_-]{35}\b/g,
  /\bxox[bpsare]-[A-Za-z0-9-]{10,}\b/g,
  /\bBearer\s+[A-Za-z0-9._-]{20,}/g,
];
const ENV_SECRET = /\b((?:[A-Z][A-Z0-9_]*)?(?:API[_-]?KEY|SECRET(?:[_-]?KEY)?|ACCESS[_-]?TOKEN|AUTH[_-]?TOKEN|PASSWORD|PASSWD|PRIVATE[_-]?KEY|CLIENT[_-]?SECRET)[A-Z0-9_]*)\s*[:=]\s*(["']?)([^\s"';|&]+)\2/gi;
const LOCAL_PATH = /(?:[A-Za-z]:[\\/]|\/(?:Users|home|root|private|Volumes|tmp|var|etc|opt)\/)[^\s"'<>}]*/g;
const SENSITIVE_FIELD = /(?:authorization|credential|password|passwd|privateKey|providerOptions|rawArguments|parsedInput|rootPath|secret|token|cwd|home|path)/i;

interface MutableRedactionReport {
  count: number;
  categories: Set<string>;
  truncated: boolean;
}

function noteRedaction(report: MutableRedactionReport, category: string): void {
  report.count += 1;
  report.categories.add(category);
}

function redactModelString(value: string, report: MutableRedactionReport): string {
  let output = value.replace(ENV_SECRET, (_match, name: string) => {
    noteRedaction(report, "environment");
    return `${name}=<REDACTED>`;
  });
  for (const pattern of SECRET_PATTERNS) {
    output = output.replace(pattern, () => {
      noteRedaction(report, "secret");
      return "<REDACTED:secret>";
    });
  }
  output = output.replace(LOCAL_PATH, () => {
    noteRedaction(report, "path");
    return "<REDACTED:path>";
  });
  if (output.length > MODEL_STRING_CHAR_LIMIT) {
    noteRedaction(report, "output-budget");
    report.truncated = true;
    return `${output.slice(0, MODEL_STRING_CHAR_LIMIT)}[…truncated]`;
  }
  return output;
}

function redactModelValue(value: unknown, report: MutableRedactionReport): JsonValue {
  if (typeof value === "string") return redactModelString(value, report);
  if (value === null || typeof value === "boolean" || typeof value === "number") return value;
  if (Array.isArray(value)) {
    if (value.length > MODEL_COLLECTION_LIMIT) {
      noteRedaction(report, "output-budget");
      report.truncated = true;
    }
    return value.slice(0, MODEL_COLLECTION_LIMIT).map((item) => redactModelValue(item, report));
  }
  if (typeof value !== "object") return String(value);
  const entries = Object.entries(value as Record<string, unknown>);
  if (entries.length > MODEL_COLLECTION_LIMIT) {
    noteRedaction(report, "output-budget");
    report.truncated = true;
  }
  const output: Record<string, JsonValue> = {};
  for (const [key, item] of entries.slice(0, MODEL_COLLECTION_LIMIT)) {
    if (SENSITIVE_FIELD.test(key)) {
      noteRedaction(report, "field");
      continue;
    }
    output[key] = redactModelValue(item, report);
  }
  return output;
}

function redactionReport(report: MutableRedactionReport): SessionModelRedactionReport {
  return {
    count: report.count,
    categories: Object.freeze([...report.categories].sort()),
    truncated: report.truncated,
  };
}

function redactSearchText(value: string, report: MutableRedactionReport): string {
  const redacted = redactModelString(value, report);
  if (redacted.length <= MODEL_SEARCH_TEXT_CHAR_LIMIT) return redacted;
  noteRedaction(report, "output-budget");
  report.truncated = true;
  return `${redacted.slice(0, MODEL_SEARCH_TEXT_CHAR_LIMIT)}[…truncated]`;
}

function redactModelIdentifier(value: string, report: MutableRedactionReport): string {
  const redacted = redactModelString(value, report);
  if (redacted.length <= MODEL_IDENTIFIER_CHAR_LIMIT) return redacted;
  noteRedaction(report, "output-budget");
  report.truncated = true;
  return `${redacted.slice(0, MODEL_IDENTIFIER_CHAR_LIMIT)}[…truncated]`;
}

function modelSearchPage(
  input: readonly SessionModelSearchResult[],
  sourceTruncated: boolean,
) {
  const report: MutableRedactionReport = { count: 0, categories: new Set(), truncated: false };
  const fixedLimitExceeded = input.length > MODEL_RESULT_LIMIT || sourceTruncated;
  if (fixedLimitExceeded) {
    noteRedaction(report, "output-budget");
    report.truncated = true;
  }
  const results = input.slice(0, MODEL_RESULT_LIMIT).map((result) => ({
    sessionId: SessionId(redactModelIdentifier(result.sessionId, report)),
    ...(result.eventSeq === undefined ? {} : { eventSeq: result.eventSeq }),
    stableId: redactModelIdentifier(result.stableId, report),
    summary: redactSearchText(result.summary, report),
    matchedText: redactSearchText(result.matchedText, report),
  }));
  return {
    results,
    redaction: redactionReport(report),
    truncated: fixedLimitExceeded || report.truncated,
  };
}

function redactModelEvent(event: ParsedSessionEvent): SessionModelEventResult | null {
  if (!MODEL_REDACTABLE_EVENT_TYPES.has(event.type)) return null;
  const report: MutableRedactionReport = { count: 0, categories: new Set(), truncated: false };
  let data = redactModelValue(event.data, report);
  if (JSON.stringify({ type: event.type, seq: event.seq, time: event.time, data }).length > MODEL_EVENT_CHAR_LIMIT) {
    noteRedaction(report, "output-budget");
    report.truncated = true;
    data = { omitted: "event data exceeded the model output budget" };
  }
  return {
    event: { type: event.type, seq: event.seq, time: event.time, data },
    redaction: redactionReport(report),
  };
}

interface QueryCursor {
  readonly version: 1;
  readonly anchor: string;
  readonly signature: string;
}

export class SessionQueryError extends Error {
  constructor(
    readonly code: "ABORTED" | "INVALID_CURSOR" | "INVALID_REQUEST" | "STALLED_HISTORY",
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = "SessionQueryError";
  }
}

function aborted(signal: AbortSignal): SessionQueryError {
  return new SessionQueryError("ABORTED", "session query was cancelled", {
    cause: signal.reason,
  });
}

function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) throw aborted(signal);
}

async function abortable<T>(operation: Promise<T>, signal?: AbortSignal): Promise<T> {
  if (signal === undefined) return operation;
  throwIfAborted(signal);
  return await new Promise<T>((resolve, reject) => {
    const onAbort = () => reject(aborted(signal));
    signal.addEventListener("abort", onAbort, { once: true });
    operation.then(
      (value) => {
        signal.removeEventListener("abort", onAbort);
        resolve(value);
      },
      (error: unknown) => {
        signal.removeEventListener("abort", onAbort);
        reject(error);
      },
    );
  });
}

function querySignature(request: SessionQueryRequest): string {
  return JSON.stringify({
    text: request.text,
    workspaceRootHash: request.workspaceRootHash ?? null,
    rigId: request.rigId ?? null,
    backend: request.backend ?? null,
    eventTypes: request.eventTypes === undefined ? null : [...request.eventTypes].sort(),
    surface: request.surface ?? null,
  });
}

function encodeCursor(cursor: QueryCursor): string {
  return `session-query:1:${encodeURIComponent(JSON.stringify(cursor))}`;
}

function decodeCursor(value: string, signature: string): QueryCursor {
  try {
    const prefix = "session-query:1:";
    if (!value.startsWith(prefix)) throw new Error("unexpected cursor prefix");
    const decoded = JSON.parse(decodeURIComponent(value.slice(prefix.length))) as Partial<QueryCursor>;
    if (decoded.version !== 1 || typeof decoded.anchor !== "string" || decoded.signature !== signature) {
      throw new Error("cursor does not match the query");
    }
    return decoded as QueryCursor;
  } catch (cause) {
    throw new SessionQueryError(
      "INVALID_CURSOR",
      "session query cursor is invalid or belongs to another query",
      { cause },
    );
  }
}

async function readSession(
  history: SessionHistoryCapability,
  sessionId: SessionId,
  signal?: AbortSignal,
  maxEventPages = MAX_EVENT_PAGES,
): Promise<SessionWindow> {
  let window = await abortable(
    history.readWindow(sessionId, { kind: "head", limit: EVENT_PAGE_SIZE }),
    signal,
  );
  const revision = Number(window.revision);
  const events: ParsedSessionEvent[] = [];

  const appendPage = (page: SessionWindow): void => {
    if (page.header.id !== sessionId || Number(page.revision) !== revision) {
      throw new SessionQueryError(
        "STALLED_HISTORY",
        `session ${sessionId} changed identity or revision while its history was paged`,
      );
    }
    let previousSeq = events.length === 0 ? -1 : Number(events[events.length - 1]!.seq);
    for (const event of page.events) {
      const seq = Number(event.seq);
      if (!Number.isSafeInteger(seq) || seq <= previousSeq) {
        throw new SessionQueryError(
          "STALLED_HISTORY",
          `session ${sessionId} event pagination did not advance beyond sequence ${previousSeq}`,
        );
      }
      events.push(event);
      previousSeq = seq;
    }
  };

  appendPage(window);

  let pageCount = 1;
  while (window.availability.later) {
    if (pageCount >= maxEventPages) {
      throw new SessionQueryError("STALLED_HISTORY", `session ${sessionId} exceeded the event page safety bound`);
    }
    const tail = events.at(-1);
    if (tail === undefined) {
      throw new SessionQueryError("STALLED_HISTORY", `session ${sessionId} returned a stalled event page`);
    }
    window = await abortable(
      history.readWindow(sessionId, {
        kind: "after",
        seq: tail.seq,
        limit: EVENT_PAGE_SIZE,
      }),
      signal,
    );
    if (window.events.length === 0) {
      throw new SessionQueryError("STALLED_HISTORY", `session ${sessionId} returned a stalled event page`);
    }
    appendPage(window);
    pageCount += 1;
  }

  return { ...window, events };
}

interface SessionQueryOptions {
  readonly maxSessionPages?: number;
  readonly maxEventPages?: number;
}

export function createSessionQuery(
  history: SessionHistoryCapability,
  options: SessionQueryOptions = {},
): SessionQueryCapability {
  const maxSessionPages = options.maxSessionPages ?? MAX_SESSION_PAGES;
  const maxEventPages = options.maxEventPages ?? MAX_EVENT_PAGES;
  return {
    async search(request: SessionQueryRequest) {
      const limit = request.limit ?? DEFAULT_RESULT_LIMIT;
      if (!Number.isSafeInteger(limit) || limit < 1 || limit > MAX_RESULT_LIMIT) {
        throw new SessionQueryError(
          "INVALID_REQUEST",
          `session query limit must be an integer between 1 and ${MAX_RESULT_LIMIT}`,
        );
      }
      const signature = querySignature(request);
      const requestedCursor = request.cursor === undefined ? undefined : decodeCursor(request.cursor, signature);
      const needle = request.text.toLowerCase();
      const results: SessionQueryResult[] = [];
      let anchorSeen = requestedCursor === undefined;
      let cursor: string | undefined;
      const seenCursors = new Set<string>();
      const seenSessionIds = new Set<SessionId>();
      let pageCount = 0;

      while (true) {
        throwIfAborted(request.signal);
        if (pageCount >= maxSessionPages) {
          throw new SessionQueryError("STALLED_HISTORY", "session history exceeded the page safety bound");
        }
        const page = await abortable(
          history.list({
            ...(cursor === undefined ? {} : { cursor }),
            limit: SESSION_PAGE_SIZE,
            ...(request.workspaceRootHash === undefined
              ? {}
              : { workspaceRootHash: request.workspaceRootHash }),
            ...(request.rigId === undefined ? {} : { rigId: request.rigId }),
          }),
          request.signal,
        );
        pageCount += 1;

        for (const listing of page.sessions) {
          if (seenSessionIds.has(listing.sessionId)) {
            throw new SessionQueryError(
              "STALLED_HISTORY",
              `session history repeated session ${listing.sessionId} while paging`,
            );
          }
          seenSessionIds.add(listing.sessionId);
          if (
            listing.health === "corrupt-prefix" ||
            listing.health === "unsupported-format"
          ) continue;
          if (request.backend !== undefined && listing.backend !== request.backend) continue;
          const session = await readSession(
            history,
            listing.sessionId,
            request.signal,
            maxEventPages,
          );
          if (request.backend !== undefined && session.header.backend !== request.backend) continue;
          if (request.rigId !== undefined && session.header.rigId !== request.rigId) continue;
          if (
            request.workspaceRootHash !== undefined &&
            session.header.workspace?.rootHash !== request.workspaceRootHash
          ) continue;
          const projection = projectCanonicalSession(session.header, session.events);
          const eventsBySeq = new Map(session.events.map((event) => [Number(event.seq), event]));

          for (const record of projection.trajectory.records) {
            if (!record.searchableText.toLowerCase().includes(needle)) continue;
            const sourceSeq = record.sourceSeqs[0];
            const sourceEvent = sourceSeq === undefined ? undefined : eventsBySeq.get(Number(sourceSeq));
            if (
              request.eventTypes !== undefined &&
              (sourceEvent === undefined || !request.eventTypes.includes(sourceEvent.type))
            ) continue;
            if (
              request.surface !== undefined &&
              (sourceSeq === undefined || projection.causal.classification[Number(sourceSeq)] !== request.surface)
            ) continue;
            const result: SessionQueryResult = {
              sessionId: session.header.id,
              ...(sourceSeq === undefined ? {} : { eventSeq: SessionSeq(Number(sourceSeq)) }),
              stableId: record.id,
              summary: record.summary,
              matchedText: record.searchableText,
            };
            if (!anchorSeen) {
              if (result.stableId === requestedCursor!.anchor) anchorSeen = true;
              continue;
            }
            if (results.length === limit) {
              return {
                results,
                cursor: encodeCursor({
                  version: 1,
                  anchor: results[results.length - 1]!.stableId,
                  signature,
                }),
                exhausted: false,
              };
            }
            results.push(result);
          }
        }

        if (page.exhausted) {
          if (!anchorSeen) {
            throw new SessionQueryError("INVALID_CURSOR", "session query cursor anchor no longer exists");
          }
          return { results, exhausted: true };
        }
        if (page.cursor === undefined || seenCursors.has(page.cursor)) {
          throw new SessionQueryError("STALLED_HISTORY", "session history pagination did not advance");
        }
        seenCursors.add(page.cursor);
        cursor = page.cursor;
      }
    },
    async readEvent(sessionId, seq) {
      const window = await history.readWindow(sessionId, { kind: "range", start: seq, end: seq });
      return window.events.find((event) => Number(event.seq) === Number(seq)) ?? null;
    },
    async explainEvent(sessionId, seq) {
      const session = await readSession(history, sessionId);
      const event = session.events.find((candidate) => Number(candidate.seq) === Number(seq));
      if (event === undefined) return null;
      const surface = foldSurface(session.events);
      return {
        event,
        sources: surface.sourcesByDerived[Number(seq)] ?? Object.freeze([]),
        derived: surface.derivedBySource[Number(seq)] ?? Object.freeze([]),
      };
    },
  };
}

async function tryReadSession(
  history: SessionHistoryCapability,
  sessionId: SessionId,
  signal?: AbortSignal,
  maxEventPages = MAX_EVENT_PAGES,
): Promise<SessionWindow | null> {
  try {
    return await readSession(history, sessionId, signal, maxEventPages);
  } catch (error) {
    if (error instanceof SessionQueryError && error.code === "ABORTED") throw error;
    return null;
  }
}

function currentExecutionBoundary(session: SessionWindow): number | undefined {
  const unresolved = new Map<string, { seq: number; turn: number; step: number }>();
  for (const event of session.events) {
    const data = event.data as Record<string, unknown>;
    if (event.type === "tool/call" && typeof data.callId === "string") {
      unresolved.set(data.callId, {
        seq: Number(event.seq),
        turn: Number(data.turn),
        step: Number(data.step),
      });
    } else if (event.type === "tool/result" && typeof data.callId === "string") {
      unresolved.delete(data.callId);
    }
  }
  const active = [...unresolved.values()].sort((left, right) => left.seq - right.seq)[0];
  if (active === undefined) return undefined;
  const stepStart = session.events.find((event) => {
    if (event.type !== "step/start") return false;
    const data = event.data as Record<string, unknown>;
    return Number(data.turn) === active.turn && Number(data.step) === active.step;
  });
  return Number(stepStart?.seq ?? active.seq);
}

function searchOneSession(
  session: SessionWindow,
  text: string,
  beforeSeq?: number,
): readonly SessionModelSearchResult[] {
  const needle = text.toLowerCase();
  const projection = projectCanonicalSession(session.header, session.events);
  return projection.trajectory.records
    .filter((record) => record.searchableText.toLowerCase().includes(needle))
    .filter((record) => {
      const seq = record.sourceSeqs[0];
      return beforeSeq === undefined || seq === undefined || Number(seq) < beforeSeq;
    })
    .map((record) => ({
      sessionId: session.header.id,
      ...(record.sourceSeqs[0] === undefined ? {} : { eventSeq: record.sourceSeqs[0] }),
      stableId: record.id,
      summary: record.summary,
      matchedText: record.searchableText,
    }));
}

function canAccess(caller: SessionWindow, target: SessionWindow): boolean {
  if (caller.header.id === target.header.id) return true;
  const workspace = caller.header.workspace?.rootHash;
  return workspace !== undefined && target.header.workspace?.rootHash === workspace;
}

export function createModelSessionQuery(
  history: SessionHistoryCapability,
): SessionModelQueryCapability {
  const humanQuery = createSessionQuery(history, {
    maxSessionPages: MODEL_SESSION_PAGE_LIMIT,
    maxEventPages: MODEL_EVENT_PAGE_LIMIT,
  });
  const readForModel = (sessionId: SessionId, signal?: AbortSignal) =>
    tryReadSession(history, sessionId, signal, MODEL_EVENT_PAGE_LIMIT);
  return {
    async search(request) {
      const caller = await readForModel(request.callerSessionId, request.signal);
      if (caller === null) {
        return modelSearchPage([], false);
      }
      if (request.targetSessionId !== undefined) {
        const target = await readForModel(request.targetSessionId, request.signal);
        if (target === null || !canAccess(caller, target)) {
          return modelSearchPage([], false);
        }
        return modelSearchPage(
          searchOneSession(
            target,
            request.text,
            target.header.id === caller.header.id ? currentExecutionBoundary(caller) : undefined,
          ),
          false,
        );
      }
      const workspaceRootHash = caller.header.workspace?.rootHash;
      if (workspaceRootHash === undefined) {
        return modelSearchPage(
          searchOneSession(caller, request.text, currentExecutionBoundary(caller)),
          false,
        );
      }
      const page = await humanQuery.search({
        text: request.text,
        signal: request.signal,
        workspaceRootHash,
        limit: MODEL_SCAN_RESULT_LIMIT,
      });
      const boundary = currentExecutionBoundary(caller);
      return modelSearchPage(
        page.results.filter((result) =>
          result.sessionId !== caller.header.id ||
          result.eventSeq === undefined ||
          boundary === undefined ||
          Number(result.eventSeq) < boundary
        ).map((result) => ({
          sessionId: result.sessionId,
          ...(result.eventSeq === undefined ? {} : { eventSeq: result.eventSeq }),
          stableId: result.stableId,
          summary: result.summary,
          matchedText: result.matchedText,
        })),
        !page.exhausted,
      );
    },
    async readEvent(request) {
      const [caller, target] = await Promise.all([
        readForModel(request.callerSessionId, request.signal),
        readForModel(request.sessionId, request.signal),
      ]);
      if (caller === null || target === null || !canAccess(caller, target)) return null;
      const event = target.events.find((candidate) => Number(candidate.seq) === Number(request.seq));
      if (event === undefined) return null;
      const boundary = target.header.id === caller.header.id
        ? currentExecutionBoundary(caller)
        : undefined;
      if (boundary !== undefined && Number(event.seq) >= boundary) return null;
      return redactModelEvent(event);
    },
    async traceSession(request) {
      const [caller, target] = await Promise.all([
        readForModel(request.callerSessionId, request.signal),
        readForModel(request.sessionId, request.signal),
      ]);
      if (caller === null || target === null || !canAccess(caller, target)) return null;

      let parentSessionId: SessionId | undefined;
      if (target.header.parent !== undefined) {
        const parent = await readForModel(target.header.parent.sessionId, request.signal);
        if (parent !== null && canAccess(caller, parent)) parentSessionId = parent.header.id;
      }

      const childSessionIds: SessionId[] = [];
      let cursor: string | undefined;
      let pageCount = 0;
      let truncated = false;
      const seenCursors = new Set<string>();
      while (pageCount < MODEL_SESSION_PAGE_LIMIT) {
        const page = await abortable(history.list({
          ...(cursor === undefined ? {} : { cursor }),
          limit: SESSION_PAGE_SIZE,
          ...(caller.header.workspace?.rootHash === undefined
            ? {}
            : { workspaceRootHash: caller.header.workspace.rootHash }),
        }), request.signal);
        pageCount += 1;
        for (const listing of page.sessions) {
          if (listing.health === "corrupt-prefix" || listing.health === "unsupported-format") continue;
          const candidate = await readForModel(listing.sessionId, request.signal);
          if (
            candidate !== null &&
            canAccess(caller, candidate) &&
            candidate.header.parent?.sessionId === target.header.id
          ) {
            childSessionIds.push(candidate.header.id);
            if (childSessionIds.length > MODEL_RESULT_LIMIT) {
              truncated = true;
              break;
            }
          }
        }
        if (truncated || page.exhausted) break;
        if (page.cursor === undefined || seenCursors.has(page.cursor)) {
          throw new SessionQueryError("STALLED_HISTORY", "session history pagination did not advance");
        }
        seenCursors.add(page.cursor);
        cursor = page.cursor;
      }
      if (pageCount >= MODEL_SESSION_PAGE_LIMIT) truncated = true;
      const report: MutableRedactionReport = { count: 0, categories: new Set(), truncated };
      if (truncated) noteRedaction(report, "output-budget");
      const sessionId = SessionId(redactModelIdentifier(target.header.id, report));
      const redactedParentId = parentSessionId === undefined
        ? undefined
        : SessionId(redactModelIdentifier(parentSessionId, report));
      const redactedChildIds = childSessionIds.slice(0, MODEL_RESULT_LIMIT).map((id) =>
        SessionId(redactModelIdentifier(id, report))
      );
      return {
        sessionId,
        ...(redactedParentId === undefined ? {} : { parentSessionId: redactedParentId }),
        childSessionIds: Object.freeze(redactedChildIds),
        redaction: redactionReport(report),
        truncated: report.truncated,
      };
    },
    async explainEvent(request) {
      const [caller, target] = await Promise.all([
        readForModel(request.callerSessionId, request.signal),
        readForModel(request.sessionId, request.signal),
      ]);
      if (caller === null || target === null || !canAccess(caller, target)) return null;
      const event = target.events.find((candidate) => Number(candidate.seq) === Number(request.seq));
      if (event === undefined) return null;
      const boundary = target.header.id === caller.header.id
        ? currentExecutionBoundary(caller)
        : undefined;
      if (boundary !== undefined && Number(event.seq) >= boundary) return null;
      const redacted = redactModelEvent(event);
      if (redacted === null) return null;
      const surface = foldSurface(target.events);
      return {
        ...redacted,
        sources: surface.sourcesByDerived[Number(event.seq)] ?? Object.freeze([]),
        derived: surface.derivedBySource[Number(event.seq)] ?? Object.freeze([]),
      };
    },
  };
}
