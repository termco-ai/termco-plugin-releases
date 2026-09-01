import {
  SessionRevision,
  SessionId,
  SessionSeq,
  parseAppendSessionEvent,
  parseSessionEvent,
  parseSessionHeader,
  planSessionTailRepair,
  validateSessionHistory,
  type AppendSessionEvent,
  type AppendSessionOptions,
  type CommittedSessionRange,
  type CreateSessionInput,
  type DurableAppendInput,
  type DurableAppendResult,
  type DiscardUncommittedTailInput,
  type ForkSessionInput,
  type ForkSessionResult,
  type ListSessionsRequest,
  type SessionHistoryCapability,
  type SessionCommit,
  type SessionInspection,
  type SessionListingPage,
  type ParsedSessionEvent,
  type PersistenceInspection,
  type PersistenceWindowRequest,
  type PrepareSessionInput,
  type PreparedSession,
  type RemoveSessionInput,
  type RemoveSessionOptions,
  type SessionRetentionPolicy,
  type SessionRetentionReport,
  type SessionSnapshot,
  type SessionPersistenceAdapter,
  type SessionWindow,
  type SessionWindowRequest,
} from "@termco/session-base";

export type SessionHistoryErrorCode =
  | "DISPOSED"
  | "EMPTY_APPEND"
  | "INVALID_RETENTION_POLICY"
  | "INVALID_LIST_REQUEST"
  | "INVALID_WINDOW"
  | "REVISION_CONFLICT"
  | "SESSION_REFERENCED"
  | "SESSION_EXISTS"
  | "SESSION_NOT_FOUND"
  | "CORRUPT_SESSION"
  | "UNSUPPORTED_FORMAT"
  | "TAIL_CONFLICT";

export class SessionHistoryError extends Error {
  readonly code: SessionHistoryErrorCode;

  constructor(code: SessionHistoryErrorCode, message: string) {
    super(message);
    this.name = "SessionHistoryError";
    this.code = code;
  }
}

function immutableCopy<T>(value: T): T {
  const copy = structuredClone(value);
  const freeze = (candidate: unknown): void => {
    if (typeof candidate !== "object" || candidate === null || Object.isFrozen(candidate)) return;
    for (const child of Object.values(candidate)) freeze(child);
    Object.freeze(candidate);
  };
  freeze(copy);
  return copy;
}

interface StoredSession {
  readonly header: ReturnType<typeof parseSessionHeader>;
  events: readonly ParsedSessionEvent[];
  revision: ReturnType<typeof SessionRevision>;
}

interface SessionHead {
  readonly revision: ReturnType<typeof SessionRevision>;
  readonly tailSeq?: ReturnType<typeof SessionSeq>;
}

class InMemorySessionPersistence implements SessionPersistenceAdapter {
  readonly #sessions = new Map<SessionId, StoredSession>();
  #disposed = false;

  async prepare(input: PrepareSessionInput): Promise<PreparedSession> {
    this.#assertActive();
    const parsed = parseSessionHeader(input.header);
    if (this.#sessions.has(parsed.id)) {
      throw new SessionHistoryError("SESSION_EXISTS", `session ${parsed.id} already exists`);
    }
    const header = immutableCopy(parsed);
    const events = immutableCopy(input.seed ?? []);
    validateSessionHistory(events);
    this.#sessions.set(header.id, { header, events, revision: SessionRevision(0) });
    const tail = events.at(-1);
    return immutableCopy({
      header,
      revision: SessionRevision(0),
      ...(tail === undefined ? {} : { tailSeq: tail.seq }),
    });
  }

  async append(input: DurableAppendInput): Promise<DurableAppendResult> {
    this.#assertActive();
    const session = this.#session(input.sessionId);
    if ((session.revision as number) !== (input.expectedRevision as number)) {
      throw new SessionHistoryError(
        "REVISION_CONFLICT",
        `session ${input.sessionId} revision is ${session.revision}, expected ${input.expectedRevision}`,
      );
    }
    const actualTail = session.events.at(-1)?.seq;
    if (
      (actualTail === undefined) !== (input.expectedTailSeq === undefined) ||
      (actualTail !== undefined && (actualTail as number) !== (input.expectedTailSeq as number))
    ) {
      throw new SessionHistoryError(
        "TAIL_CONFLICT",
        `session ${input.sessionId} tail is ${String(actualTail)}, expected ${String(input.expectedTailSeq)}`,
      );
    }
    const candidate = [...session.events, ...input.events];
    validateSessionHistory(candidate);
    session.events = immutableCopy(candidate);
    session.revision = SessionRevision((session.revision as number) + 1);
    return immutableCopy({
      revision: session.revision,
      tailSeq: input.events[input.events.length - 1]!.seq,
      durability: input.durability,
    });
  }

  async remove(input: RemoveSessionInput): Promise<void> {
    this.#assertActive();
    const session = this.#session(input.sessionId);
    if (
      input.expectedRevision !== undefined &&
      (session.revision as number) !== (input.expectedRevision as number)
    ) {
      throw new SessionHistoryError(
        "REVISION_CONFLICT",
        `session ${input.sessionId} revision is ${session.revision}, expected ${input.expectedRevision}`,
      );
    }
    this.#sessions.delete(input.sessionId);
  }

  async readWindow(input: PersistenceWindowRequest): Promise<SessionWindow> {
    this.#assertActive();
    const { sessionId, window: request } = input;
    const session = this.#session(sessionId);
    const length = session.events.length;
    let start: number;
    let end: number;
    if (request.kind === "range") {
      const requestedStart = request.start as number;
      const requestedEnd = request.end as number;
      if (
        !Number.isSafeInteger(requestedStart) ||
        !Number.isSafeInteger(requestedEnd) ||
        requestedStart < 0 ||
        requestedEnd < requestedStart
      ) {
        throw new SessionHistoryError("INVALID_WINDOW", "range bounds must be ordered non-negative integers");
      }
      start = Math.min(requestedStart, length);
      end = Math.min(requestedEnd + 1, length);
    } else {
      if (!Number.isSafeInteger(request.limit) || request.limit < 0) {
        throw new SessionHistoryError("INVALID_WINDOW", "window limit must be a non-negative integer");
      }
      if (request.kind === "head") {
        start = 0;
        end = Math.min(request.limit, length);
      } else if (request.kind === "tail") {
        start = Math.max(0, length - request.limit);
        end = length;
      } else if (request.kind === "before") {
        const anchor = Math.max(0, Math.min(request.seq as number, length));
        end = anchor;
        start = Math.max(0, end - request.limit);
      } else {
        start = Math.max(0, Math.min((request.seq as number) + 1, length));
        end = Math.min(start + request.limit, length);
      }
    }
    const events = session.events.slice(start, end);
    const report = validateSessionHistory(session.events);
    const repairedSeq = report.repairedThroughSeq === undefined
      ? undefined
      : session.events[report.repairedThroughSeq]?.seq;
    return immutableCopy({
      header: session.header,
      events,
      revision: session.revision,
      loadedRange: { start, end: end - 1 },
      availability: { earlier: start > 0, later: end < length },
      fidelity: session.header.fidelity,
      repair: report.suspension !== undefined
        ? { state: "waiting-input" }
        : repairedSeq === undefined
          ? { state: "healthy" }
        : { state: "repaired", repairedThroughSeq: repairedSeq },
    });
  }

  async list(request: ListSessionsRequest = {}): Promise<SessionListingPage> {
    this.#assertActive();
    const limit = request.limit ?? 50;
    if (!Number.isSafeInteger(limit) || limit < 1) {
      throw new SessionHistoryError("INVALID_LIST_REQUEST", "list limit must be a positive integer");
    }
    const listings = [...this.#sessions.values()]
      .filter((session) =>
        request.workspaceRootHash === undefined ||
        session.header.workspace?.rootHash === request.workspaceRootHash
      )
      .map((session) => {
        const report = validateSessionHistory(session.events);
        const open =
          report.openTurn !== undefined ||
          report.openStep !== undefined ||
          report.unresolvedCallIds.length > 0 ||
          report.pendingApprovalIds.length > 0 ||
          report.pendingRetryIds.length > 0 ||
          report.openCompactionIds.length > 0 ||
          report.openSubagentSessionIds.length > 0;
        const latestTitle = [...session.events].reverse().find((event) => event.type === "session/title");
        const latestPin = [...session.events].reverse().find((event) => event.type === "session/pin");
        const latestRig = [...session.events].reverse().find((event) => event.type === "session/rig");
        const rigId = latestRig === undefined
          ? session.header.rigId
          : (latestRig.data as { readonly rigId: string | null }).rigId ?? undefined;
        const tail = session.events.at(-1);
        return {
          sessionId: session.header.id,
          createdAt: session.header.createdAt,
          updatedAt: tail?.time ?? session.header.createdAt,
          ...(rigId === undefined ? {} : { rigId }),
          backend: session.header.backend,
          fidelity: session.header.fidelity,
          revision: session.revision,
          ...(tail === undefined ? {} : { tailSeq: tail.seq }),
          ...(latestTitle === undefined
            ? {}
            : { title: (latestTitle.data as { readonly title: string }).title }),
          ...(session.header.parent === undefined
            ? {}
            : { parentSessionId: session.header.parent.sessionId }),
          ...(latestPin === undefined
            ? {}
            : { pinned: (latestPin.data as { readonly pinned: boolean }).pinned }),
          health: report.suspension !== undefined
            ? "waiting-input" as const
            : open ? "open-tail" as const : "healthy" as const,
        };
      })
      .filter((listing) => request.rigId === undefined || listing.rigId === request.rigId)
      .sort((left, right) =>
        right.updatedAt - left.updatedAt || String(left.sessionId).localeCompare(String(right.sessionId)),
      );
    let start = 0;
    if (request.cursor !== undefined) {
      const cursorIndex = listings.findIndex((listing) => listing.sessionId === request.cursor);
      if (cursorIndex < 0) {
        throw new SessionHistoryError("INVALID_LIST_REQUEST", "list cursor does not identify a matching session");
      }
      start = cursorIndex + 1;
    }
    const sessions = listings.slice(start, start + limit);
    const exhausted = start + sessions.length >= listings.length;
    return immutableCopy({
      sessions,
      ...(exhausted || sessions.length === 0
        ? {}
        : { cursor: String(sessions[sessions.length - 1]!.sessionId) }),
      exhausted,
    });
  }

  async inspect(sessionId: SessionId): Promise<PersistenceInspection> {
    this.#assertActive();
    const session = this.#session(sessionId);
    const report = validateSessionHistory(session.events);
    const tail = session.events.at(-1);
    const open =
      report.openTurn !== undefined ||
      report.openStep !== undefined ||
      report.unresolvedCallIds.length > 0 ||
      report.pendingApprovalIds.length > 0 ||
      report.pendingRetryIds.length > 0 ||
      report.openCompactionIds.length > 0 ||
      report.openSubagentSessionIds.length > 0;
    const waiting = report.suspension !== undefined;
    const proposedRepair = open && !waiting ? planSessionTailRepair(session.events) : [];
    return immutableCopy({
      header: session.header,
      events: session.events,
      inspection: {
        sessionId,
        state: waiting ? "waiting-input" : open ? "open-tail" : "healthy",
        revision: session.revision,
        ...(tail === undefined ? {} : { tailSeq: tail.seq, safeThroughSeq: tail.seq }),
        ...(open && !waiting ? { proposedRepair } : {}),
      },
    });
  }

  async discardUncommittedTail(_input: DiscardUncommittedTailInput): Promise<void> {
    this.#assertActive();
    const session = this.#session(_input.sessionId);
    if ((session.revision as number) !== (_input.expectedRevision as number)) {
      throw new SessionHistoryError("REVISION_CONFLICT", `session ${_input.sessionId} revision changed`);
    }
  }

  async flush(sessionId: SessionId): Promise<ReturnType<typeof SessionRevision>> {
    this.#assertActive();
    return this.#session(sessionId).revision;
  }

  async dispose(): Promise<void> {
    this.#disposed = true;
    this.#sessions.clear();
  }

  #session(sessionId: SessionId): StoredSession {
    const session = this.#sessions.get(sessionId);
    if (session === undefined) {
      throw new SessionHistoryError("SESSION_NOT_FOUND", `session ${sessionId} does not exist`);
    }
    return session;
  }

  #assertActive(): void {
    if (this.#disposed) throw new SessionHistoryError("DISPOSED", "session history is disposed");
  }
}

export interface DisposableSessionHistoryCapability extends SessionHistoryCapability {
  dispose(): Promise<void>;
}

class SessionHistoryOwner implements DisposableSessionHistoryCapability {
  readonly #persistence: SessionPersistenceAdapter;
  readonly #knownSessions = new Set<SessionId>();
  readonly #heads = new Map<SessionId, SessionHead>();
  readonly #appendLanes = new Map<SessionId, Promise<void>>();
  readonly #subscribers = new Map<SessionId, Set<(commit: SessionCommit) => void>>();
  #disposed = false;
  #disposePromise: Promise<void> | undefined;

  constructor(persistence: SessionPersistenceAdapter) {
    this.#persistence = persistence;
  }

  async create(input: CreateSessionInput): Promise<SessionSnapshot> {
    this.#assertActive();
    const parsedHeader = parseSessionHeader(input.header);
    const seed = (input.seed ?? []).map((event, index) =>
      parseSessionEvent({ ...parseAppendSessionEvent(event), seq: SessionSeq(index) }),
    );
    validateSessionHistory(seed);
    const prepared = await this.#persistence.prepare({
      header: parsedHeader,
      seed,
      durability: input.durability ?? "memory",
    });
    this.#knownSessions.add(prepared.header.id);
    this.#heads.set(prepared.header.id, {
      revision: prepared.revision,
      ...(prepared.tailSeq === undefined ? {} : { tailSeq: prepared.tailSeq }),
    });
    return prepared;
  }

  async append(
    sessionId: SessionId,
    events: readonly AppendSessionEvent[],
    options?: AppendSessionOptions,
  ): Promise<CommittedSessionRange> {
    this.#assertActive();
    if (events.length === 0) {
      throw new SessionHistoryError("EMPTY_APPEND", "an append batch must contain at least one event");
    }
    const parsed = events.map((event) => parseAppendSessionEvent(event));
    return this.#serializeAppend(sessionId, async () => {
      let current = this.#heads.get(sessionId);
      if (current === undefined) {
        const persisted = await this.#persistence.inspect(sessionId);
        if (persisted.inspection.revision === undefined) {
          throw new SessionHistoryError(
            persisted.inspection.state === "unsupported-format" ? "UNSUPPORTED_FORMAT" : "CORRUPT_SESSION",
            persisted.inspection.message ?? `session ${sessionId} has no safe revision`,
          );
        }
        current = {
          revision: persisted.inspection.revision,
          ...(persisted.inspection.tailSeq === undefined ? {} : { tailSeq: persisted.inspection.tailSeq }),
        };
        this.#heads.set(sessionId, current);
      }
      if (
        options?.expectedRevision !== undefined &&
        (options.expectedRevision as number) !== (current.revision as number)
      ) {
        throw new SessionHistoryError(
          "REVISION_CONFLICT",
          `session ${sessionId} revision is ${current.revision}, expected ${options.expectedRevision}`,
        );
      }
      if (
        options?.expectedTailSeq !== undefined &&
        (current.tailSeq === undefined || (options.expectedTailSeq as number) !== (current.tailSeq as number))
      ) {
        throw new SessionHistoryError(
          "TAIL_CONFLICT",
          `session ${sessionId} tail is ${String(current.tailSeq)}, expected ${options.expectedTailSeq}`,
        );
      }
      const nextSeq = current.tailSeq === undefined ? 0 : (current.tailSeq as number) + 1;
      const committed = parsed.map((event, index) =>
        parseSessionEvent({ ...event, seq: SessionSeq(nextSeq + index) }),
      );
      let appended: DurableAppendResult;
      try {
        appended = await this.#persistence.append({
          sessionId,
          events: committed,
          expectedRevision: current.revision,
          ...(current.tailSeq === undefined ? {} : { expectedTailSeq: current.tailSeq }),
          durability: options?.durability ?? "memory",
        });
      } catch (error) {
        this.#heads.delete(sessionId);
        throw error;
      }
      const range = immutableCopy({
        sessionId,
        firstSeq: committed[0]!.seq,
        lastSeq: appended.tailSeq,
        revision: appended.revision,
        durability: appended.durability,
      });
      this.#heads.set(sessionId, {
        revision: range.revision,
        tailSeq: range.lastSeq,
      });
      this.#publish(immutableCopy({
        sessionId,
        events: committed,
        revision: range.revision,
        tailSeq: range.lastSeq,
        durability: range.durability,
      }));
      return range;
    });
  }

  async readWindow(sessionId: SessionId, request: SessionWindowRequest): Promise<SessionWindow> {
    this.#assertActive();
    return this.#persistence.readWindow({ sessionId, window: request });
  }

  async inspect(sessionId: SessionId): Promise<SessionInspection> {
    this.#assertActive();
    const inspected = await this.#persistence.inspect(sessionId);
    if (inspected.inspection.revision === undefined ||
        inspected.inspection.state === "corrupt-prefix" ||
        inspected.inspection.state === "unsupported-format" ||
        inspected.uncommittedTail !== undefined) {
      this.#heads.delete(sessionId);
    } else {
      this.#heads.set(sessionId, {
        revision: inspected.inspection.revision,
        ...(inspected.inspection.tailSeq === undefined ? {} : { tailSeq: inspected.inspection.tailSeq }),
      });
    }
    return inspected.inspection;
  }

  async loadForContinuation(sessionId: SessionId): Promise<SessionWindow> {
    this.#assertActive();
    return this.#serializeAppend(sessionId, async () => {
      let persisted = await this.#persistence.inspect(sessionId);
      const initial = persisted.inspection;
      if (initial.state === "corrupt-prefix") {
        this.#heads.delete(sessionId);
        throw new SessionHistoryError(
          "CORRUPT_SESSION",
          initial.message ?? `session ${sessionId} has committed-prefix corruption`,
        );
      }
      if (initial.state === "unsupported-format") {
        this.#heads.delete(sessionId);
        throw new SessionHistoryError(
          "UNSUPPORTED_FORMAT",
          initial.message ?? `session ${sessionId} uses an unsupported current-store format`,
        );
      }

      let repaired = false;
      if (persisted.uncommittedTail !== undefined) {
        if (initial.revision === undefined) {
          throw new SessionHistoryError("CORRUPT_SESSION", `session ${sessionId} has no safe revision`);
        }
        await this.#persistence.discardUncommittedTail({
          sessionId,
          expectedRevision: initial.revision,
          ...persisted.uncommittedTail,
        });
        repaired = true;
        persisted = await this.#persistence.inspect(sessionId);
      }

      const proposed = persisted.inspection.state === "waiting-input"
        ? []
        : persisted.inspection.proposedRepair ?? planSessionTailRepair(persisted.events);
      if (proposed.length > 0) {
        const current = persisted.inspection;
        if (current.revision === undefined) {
          throw new SessionHistoryError("CORRUPT_SESSION", `session ${sessionId} has no safe revision`);
        }
        const nextSeq = current.tailSeq === undefined ? 0 : (current.tailSeq as number) + 1;
        const committed = proposed.map((event, index) =>
          parseSessionEvent({ ...parseAppendSessionEvent(event), seq: SessionSeq(nextSeq + index) }),
        );
        validateSessionHistory([...persisted.events, ...committed]);
        let appended: DurableAppendResult;
        try {
          appended = await this.#persistence.append({
            sessionId,
            events: committed,
            expectedRevision: current.revision,
            ...(current.tailSeq === undefined ? {} : { expectedTailSeq: current.tailSeq }),
            durability: "flushed",
          });
        } catch (error) {
          this.#heads.delete(sessionId);
          throw error;
        }
        const commit = immutableCopy({
          sessionId,
          events: committed,
          revision: appended.revision,
          tailSeq: appended.tailSeq,
          durability: appended.durability,
        });
        this.#publish(commit);
        repaired = true;
      }

      await this.#persistence.flush(sessionId);
      const window = await this.#persistence.readWindow({
        sessionId,
        window: { kind: "head", limit: Number.MAX_SAFE_INTEGER },
      });
      this.#heads.set(sessionId, {
        revision: window.revision,
        ...(window.events.at(-1) === undefined ? {} : { tailSeq: window.events.at(-1)!.seq }),
      });
      if (!repaired) return window;
      return immutableCopy({
        ...window,
        repair: {
          state: "repaired" as const,
          ...(window.events.at(-1) === undefined
            ? {}
            : { repairedThroughSeq: window.events.at(-1)!.seq }),
        },
      });
    });
  }

  async flush(sessionId: SessionId): Promise<ReturnType<typeof SessionRevision>> {
    this.#assertActive();
    return this.#serializeAppend(sessionId, async () => {
      try {
        return await this.#persistence.flush(sessionId);
      } catch (error) {
        this.#heads.delete(sessionId);
        throw error;
      }
    });
  }

  async fork(_input: ForkSessionInput): Promise<ForkSessionResult> {
    this.#assertActive();
    const input = _input;
    return this.#serializeAppend(input.sessionId, async () => {
      const parent = await this.#persistence.inspect(input.sessionId);
      if (!parent.header) {
        throw new SessionHistoryError("SESSION_NOT_FOUND", `session ${input.sessionId} has no header`);
      }
      const events = parent.events;
      let requestedSeq: number;
      if (input.boundary.kind === "completed-turn") {
        const completedTurn = input.boundary.turn;
        const end = events.find((event) =>
          event.type === "turn/end" &&
          Number((event.data as Record<string, unknown>).turn) === completedTurn
        );
        if (!end) {
          throw new SessionHistoryError(
            "INVALID_WINDOW",
            `session ${input.sessionId} has no completed turn ${completedTurn}`,
          );
        }
        requestedSeq = end.seq as number;
      } else {
        requestedSeq = input.boundary.seq as number;
        if (!events.some((event) => (event.seq as number) === requestedSeq)) {
          throw new SessionHistoryError(
            "INVALID_WINDOW",
            `session ${input.sessionId} has no event ${requestedSeq}`,
          );
        }
      }

      let resolvedSeq = -1;
      for (let candidate = requestedSeq; candidate >= 0; candidate -= 1) {
        try {
          const report = validateSessionHistory(events.slice(0, candidate + 1));
          const balanced =
            report.openTurn === undefined &&
            report.openStep === undefined &&
            report.unresolvedCallIds.length === 0 &&
            report.pendingApprovalIds.length === 0 &&
            report.pendingRetryIds.length === 0 &&
            report.openCompactionIds.length === 0 &&
            report.openSubagentSessionIds.length === 0;
          if (balanced) {
            resolvedSeq = candidate;
            break;
          }
        } catch {
          // Earlier candidates may still be valid completed structural boundaries.
        }
      }
      if (resolvedSeq < 0) {
        throw new SessionHistoryError(
          "INVALID_WINDOW",
          `session ${input.sessionId} has no safe fork boundary at or before ${requestedSeq}`,
        );
      }

      const childSessionId = SessionId(crypto.randomUUID());
      const copied = events.slice(0, resolvedSeq + 1);
      const createdAt = Date.now();
      const seed: ParsedSessionEvent[] = [
        ...copied,
        parseSessionEvent({
          type: "session/end-seed",
          seq: SessionSeq(copied.length),
          time: createdAt,
          data: {},
        }),
        ...(input.title === undefined
          ? []
          : [parseSessionEvent({
              type: "session/title",
              seq: SessionSeq(copied.length + 1),
              time: createdAt,
              data: { title: input.title, source: "user" },
            })]),
      ];
      validateSessionHistory(seed);
      const prepared = await this.#persistence.prepare({
        header: parseSessionHeader({
          ...parent.header,
          id: childSessionId,
          createdAt,
          parent: {
            sessionId: input.sessionId,
            boundarySeq: SessionSeq(resolvedSeq),
            seedLength: copied.length,
          },
          origin: input.origin ?? "fork",
        }),
        seed,
        durability: "written",
      });
      this.#knownSessions.add(childSessionId);
      this.#heads.set(childSessionId, {
        revision: prepared.revision,
        ...(prepared.tailSeq === undefined ? {} : { tailSeq: prepared.tailSeq }),
      });
      const snapped = resolvedSeq !== requestedSeq;
      return immutableCopy({
        childSessionId,
        parentSessionId: input.sessionId,
        boundary: {
          requested: input.boundary,
          resolvedSeq: SessionSeq(resolvedSeq),
          seedLength: copied.length,
          structuralState: snapped ? "repaired" : "balanced",
          ...(snapped
            ? { warning: `Fork boundary moved from event ${requestedSeq} to completed event ${resolvedSeq}` }
            : {}),
        },
        revision: prepared.revision,
      });
    });
  }

  async remove(sessionId: SessionId, options?: RemoveSessionOptions): Promise<void> {
    this.#assertActive();
    return this.#serializeAppend(sessionId, async () => {
      const referrer = await this.#findChild(sessionId);
      if (referrer !== undefined) {
        throw new SessionHistoryError(
          "SESSION_REFERENCED",
          `session ${sessionId} is the parent of ${referrer} and cannot be removed`,
        );
      }
      await this.#persistence.remove({
        sessionId,
        ...(options?.expectedRevision === undefined
          ? {}
          : { expectedRevision: options.expectedRevision }),
      });
      this.#knownSessions.delete(sessionId);
      this.#heads.delete(sessionId);
      this.#subscribers.delete(sessionId);
    });
  }

  async enforceRetention(_policy: SessionRetentionPolicy): Promise<SessionRetentionReport> {
    this.#assertActive();
    const policy = _policy;
    if (!Number.isFinite(policy.deleteUpdatedBefore)) {
      throw new SessionHistoryError(
        "INVALID_RETENTION_POLICY",
        "retention cutoff must be a finite timestamp",
      );
    }
    const listings = await this.#listAllSessions();
    const active = new Set(policy.activeSessionIds ?? []);
    const protections = new Map<SessionId, Set<"active" | "open" | "pinned" | "recent" | "referenced">>();
    const protect = (
      sessionId: SessionId,
      reason: "active" | "open" | "pinned" | "recent" | "referenced",
    ) => {
      const reasons = protections.get(sessionId) ?? new Set();
      reasons.add(reason);
      protections.set(sessionId, reasons);
    };
    for (const session of listings) {
      if (session.updatedAt >= policy.deleteUpdatedBefore) protect(session.sessionId, "recent");
      if (active.has(session.sessionId)) protect(session.sessionId, "active");
      if (session.health === "open-tail") protect(session.sessionId, "open");
      if (session.pinned === true) protect(session.sessionId, "pinned");
    }

    const byId = new Map(listings.map((session) => [session.sessionId, session]));
    for (const rootId of [...protections.keys()]) {
      let parentId = byId.get(rootId)?.parentSessionId;
      const visited = new Set<SessionId>();
      while (parentId !== undefined && !visited.has(parentId)) {
        visited.add(parentId);
        protect(parentId, "referenced");
        parentId = byId.get(parentId)?.parentSessionId;
      }
    }

    const depth = (sessionId: SessionId): number => {
      let result = 0;
      let parentId = byId.get(sessionId)?.parentSessionId;
      const visited = new Set<SessionId>([sessionId]);
      while (parentId !== undefined && !visited.has(parentId)) {
        visited.add(parentId);
        result += 1;
        parentId = byId.get(parentId)?.parentSessionId;
      }
      return result;
    };
    const eligibleSessionIds = listings
      .filter((session) => !protections.has(session.sessionId))
      .sort((left, right) =>
        depth(right.sessionId) - depth(left.sessionId) ||
        left.updatedAt - right.updatedAt ||
        String(left.sessionId).localeCompare(String(right.sessionId)),
      )
      .map((session) => session.sessionId);
    const removedSessionIds: SessionId[] = [];
    if (policy.dryRun !== true) {
      for (const sessionId of eligibleSessionIds) {
        await this.remove(sessionId);
        removedSessionIds.push(sessionId);
      }
    }
    const protectedSessions = listings.flatMap((session) => {
      const reasons = protections.get(session.sessionId);
      return reasons === undefined
        ? []
        : [{ sessionId: session.sessionId, protections: [...reasons] }];
    });
    return immutableCopy({
      protected: protectedSessions,
      eligibleSessionIds,
      removedSessionIds,
    });
  }

  async list(request?: ListSessionsRequest): Promise<SessionListingPage> {
    this.#assertActive();
    return this.#persistence.list(request);
  }

  subscribe(sessionId: SessionId, listener: (commit: SessionCommit) => void): () => void {
    this.#assertActive();
    let listeners = this.#subscribers.get(sessionId);
    if (listeners === undefined) {
      listeners = new Set();
      this.#subscribers.set(sessionId, listeners);
    }
    listeners.add(listener);
    let active = true;
    return () => {
      if (!active) return;
      active = false;
      listeners!.delete(listener);
      if (listeners!.size === 0) this.#subscribers.delete(sessionId);
    };
  }

  dispose(): Promise<void> {
    if (this.#disposePromise !== undefined) return this.#disposePromise;
    this.#disposed = true;
    this.#subscribers.clear();
    const accepted = [...this.#appendLanes.values()];
    this.#disposePromise = Promise.all(accepted).then(async () => {
      this.#knownSessions.clear();
      this.#heads.clear();
      await this.#persistence.dispose();
    });
    return this.#disposePromise;
  }

  #assertActive(): void {
    if (this.#disposed) throw new SessionHistoryError("DISPOSED", "session history is disposed");
  }

  #publish(commit: SessionCommit): void {
    const listeners = this.#subscribers.get(commit.sessionId);
    if (listeners === undefined) return;
    for (const listener of [...listeners]) {
      try {
        listener(commit);
      } catch {
        // A faulty observer cannot roll back a commit or starve other observers.
      }
    }
  }

  async #serializeAppend<T>(sessionId: SessionId, operation: () => Promise<T>): Promise<T> {
    const previous = this.#appendLanes.get(sessionId) ?? Promise.resolve();
    let release!: () => void;
    const current = new Promise<void>((resolve) => {
      release = resolve;
    });
    this.#appendLanes.set(sessionId, current);
    await previous;
    try {
      return await operation();
    } finally {
      release();
      if (this.#appendLanes.get(sessionId) === current) this.#appendLanes.delete(sessionId);
    }
  }

  async #findChild(parentSessionId: SessionId): Promise<SessionId | undefined> {
    let cursor: string | undefined;
    do {
      const page = await this.#persistence.list({
        ...(cursor === undefined ? {} : { cursor }),
        limit: 200,
      });
      const child = page.sessions.find(
        (session) => session.parentSessionId === parentSessionId,
      );
      if (child !== undefined) return child.sessionId;
      cursor = page.cursor;
    } while (cursor !== undefined);
    return undefined;
  }

  async #listAllSessions(): Promise<SessionListingPage["sessions"]> {
    const sessions: SessionListingPage["sessions"][number][] = [];
    let cursor: string | undefined;
    do {
      const page = await this.#persistence.list({
        ...(cursor === undefined ? {} : { cursor }),
        limit: 200,
      });
      sessions.push(...page.sessions);
      cursor = page.cursor;
    } while (cursor !== undefined);
    return sessions;
  }
}

export function createInMemorySessionHistory(): DisposableSessionHistoryCapability {
  return new SessionHistoryOwner(new InMemorySessionPersistence());
}

export function createSessionHistory(
  persistence: SessionPersistenceAdapter,
): DisposableSessionHistoryCapability {
  return new SessionHistoryOwner(persistence);
}
