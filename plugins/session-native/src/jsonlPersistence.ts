import {
  SESSION_FORMAT_VERSION,
  SessionRevision,
  createSessionHistoryValidator,
  parseSessionEvent,
  parseSessionHeader,
  planSessionTailRepair,
  type DiscardUncommittedTailInput,
  type DurableAppendInput,
  type DurableAppendResult,
  type ListSessionsRequest,
  type ParsedSessionEvent,
  type PersistenceInspection,
  type PersistenceWindowRequest,
  type PreparedSession,
  type PrepareSessionInput,
  type RemoveSessionInput,
  type SessionHeader,
  type IncrementalSessionHistoryValidator,
  type SessionHistoryValidationReport,
  type SessionId,
  type SessionListing,
  type SessionListingPage,
  type SessionPersistenceAdapter,
  type SessionWindow,
} from "@termco/session-base";
import { appendFile, mkdir, open, readFile, readdir, rename, rm, truncate, writeFile } from "node:fs/promises";
import { join } from "node:path";

const SESSION_ID = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;

type CommitRecord = {
  readonly formatVersion: 2;
  readonly kind: "commit";
  readonly revision: number;
  readonly events: readonly unknown[];
};

type LoadedSession = {
  readonly header: SessionHeader;
  readonly events: readonly ParsedSessionEvent[];
  readonly revision: ReturnType<typeof SessionRevision>;
  readonly validation: SessionHistoryValidationReport;
};

type SessionController = {
  readonly header: SessionHeader;
  durableRevision: ReturnType<typeof SessionRevision>;
  revision: ReturnType<typeof SessionRevision>;
  readonly events: ParsedSessionEvent[];
  readonly validator: IncrementalSessionHistoryValidator;
  readonly pending: CommitRecord[];
};

function fail(code: string, message: string): never {
  const error = new Error(message) as Error & { code: string };
  error.name = "SessionPersistenceError";
  error.code = code;
  throw error;
}

function immutable<T>(value: T): T {
  const copy = structuredClone(value);
  const freeze = (candidate: unknown): void => {
    if (typeof candidate !== "object" || candidate === null || Object.isFrozen(candidate)) return;
    for (const child of Object.values(candidate)) freeze(child);
    Object.freeze(candidate);
  };
  freeze(copy);
  return copy;
}

function objectRecord(value: unknown): Record<string, unknown> | undefined {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined;
}

function safeId(sessionId: SessionId): string {
  const id = String(sessionId);
  if (!SESSION_ID.test(id)) fail("INVALID_SESSION_ID", `invalid session id: ${id}`);
  return id;
}

function commitLine(record: CommitRecord): string {
  return `${JSON.stringify(record)}\n`;
}

function stateFromReport(report: SessionHistoryValidationReport) {
  return {
    report,
    waiting: report.suspension !== undefined,
    open:
      report.openTurn !== undefined ||
      report.openStep !== undefined ||
      report.unresolvedCallIds.length > 0 ||
      report.pendingApprovalIds.length > 0 ||
      report.pendingRetryIds.length > 0 ||
      report.openCompactionIds.length > 0 ||
      report.openSubagentSessionIds.length > 0,
  };
}

export class JsonlSessionPersistence implements SessionPersistenceAdapter {
  readonly #root: string;
  readonly #controllers = new Map<SessionId, SessionController>();
  readonly #validatedInspections = new WeakMap<PersistenceInspection, IncrementalSessionHistoryValidator>();
  #disposed = false;

  constructor(root: string) {
    this.#root = root;
  }

  async prepare(input: PrepareSessionInput): Promise<PreparedSession> {
    this.#active();
    const header = parseSessionHeader(input.header);
    const id = safeId(header.id);
    const target = join(this.#root, id);
    const temporary = join(this.#root, `.${id}.${crypto.randomUUID()}.preparing`);
    const headerText = `${JSON.stringify(header)}\n`;
    const seed = input.seed ?? [];
    const validator = createSessionHistoryValidator();
    validator.append(seed);
    const seedText = commitLine({
      formatVersion: 2,
      kind: "commit",
      revision: 0,
      events: seed,
    });
    await mkdir(this.#root, { recursive: true });
    try {
      await mkdir(temporary, { recursive: false });
      await writeFile(join(temporary, "header.json"), headerText, {
        encoding: "utf8",
        flag: "wx",
      });
      await writeFile(join(temporary, "events.jsonl"), seedText, { encoding: "utf8", flag: "wx" });
      if (input.durability === "flushed") {
        await Promise.all([
          this.#syncPath(join(temporary, "header.json")),
          this.#syncPath(join(temporary, "events.jsonl")),
        ]);
        await this.#syncPath(temporary);
      }
      await rename(temporary, target);
      if (input.durability === "flushed") await this.#syncPath(this.#root);
    } catch (error) {
      await rm(temporary, { recursive: true, force: true });
      if ((error as NodeJS.ErrnoException).code === "EEXIST" ||
          (error as NodeJS.ErrnoException).code === "ENOTEMPTY") {
        fail("SESSION_EXISTS", `session ${header.id} already exists`);
      }
      throw error;
    }
    this.#controllers.set(header.id, {
      header,
      durableRevision: SessionRevision(0),
      revision: SessionRevision(0),
      events: [...seed],
      validator,
      pending: [],
    });
    const tail = input.seed?.at(-1);
    return immutable({
      header,
      revision: SessionRevision(0),
      ...(tail === undefined ? {} : { tailSeq: tail.seq }),
    });
  }

  async append(input: DurableAppendInput): Promise<DurableAppendResult> {
    this.#active();
    const loaded = await this.#load(input.sessionId);
    if ((loaded.revision as number) !== (input.expectedRevision as number)) {
      fail("REVISION_CONFLICT", `session ${input.sessionId} revision changed`);
    }
    const tail = loaded.events.at(-1)?.seq;
    if ((tail === undefined) !== (input.expectedTailSeq === undefined) ||
        (tail !== undefined && (tail as number) !== (input.expectedTailSeq as number))) {
      fail("TAIL_CONFLICT", `session ${input.sessionId} tail changed`);
    }
    const revision = SessionRevision((loaded.revision as number) + 1);
    const record: CommitRecord = {
      formatVersion: 2,
      kind: "commit",
      revision: revision as number,
      events: input.events,
    };
    const controller = await this.#controller(input.sessionId);
    controller.validator.append(input.events);
    try {
      if (input.durability === "memory") {
        controller.pending.push(record);
      } else {
        const records = [...controller.pending, record];
        const path = join(this.#sessionDir(input.sessionId), "events.jsonl");
        const appendedText = records.map(commitLine).join("");
        await appendFile(path, appendedText, "utf8");
        if (input.durability === "flushed") await this.#syncPath(path);
        controller.pending.splice(0);
        controller.durableRevision = revision;
      }
    } catch (error) {
      this.#controllers.delete(input.sessionId);
      throw error;
    }
    controller.events.push(...input.events);
    controller.revision = revision;
    return immutable({
      revision,
      tailSeq: input.events[input.events.length - 1]!.seq,
      durability: input.durability,
    });
  }

  async readWindow(input: PersistenceWindowRequest): Promise<SessionWindow> {
    this.#active();
    const loaded = await this.#load(input.sessionId);
    const length = loaded.events.length;
    let start = 0;
    let end = length;
    const request = input.window;
    if (request.kind === "head") end = Math.min(length, request.limit);
    else if (request.kind === "tail") start = Math.max(0, length - request.limit);
    else if (request.kind === "before") {
      end = Math.max(0, Math.min(request.seq as number, length));
      start = Math.max(0, end - request.limit);
    } else if (request.kind === "after") {
      start = Math.max(0, Math.min((request.seq as number) + 1, length));
      end = Math.min(length, start + request.limit);
    } else {
      start = Math.max(0, Math.min(request.start as number, length));
      end = Math.max(start, Math.min((request.end as number) + 1, length));
    }
    const state = stateFromReport(loaded.validation);
    const repairedSeq = loaded.validation.repairedThroughSeq === undefined
      ? undefined
      : loaded.events[loaded.validation.repairedThroughSeq]?.seq;
    return immutable({
      header: loaded.header,
      events: loaded.events.slice(start, end),
      revision: loaded.revision,
      loadedRange: { start, end: end - 1 },
      availability: { earlier: start > 0, later: end < length },
      fidelity: loaded.header.fidelity,
      repair: state.waiting
        ? { state: "waiting-input" }
        : state.open
          ? { state: "open-tail" }
        : repairedSeq === undefined
          ? { state: "healthy" }
          : { state: "repaired", repairedThroughSeq: repairedSeq },
    });
  }

  async inspect(sessionId: SessionId): Promise<PersistenceInspection> {
    this.#active();
    const cached = this.#controllers.get(sessionId);
    const disk = await this.#inspectDisk(sessionId);
    if (disk.inspection.state === "corrupt-prefix" ||
        disk.inspection.state === "unsupported-format" ||
        disk.header === undefined ||
        disk.inspection.revision === undefined) {
      if (cached?.pending.length === 0) this.#controllers.delete(sessionId);
      return disk;
    }
    if (cached === undefined || cached.pending.length === 0) {
      if (disk.uncommittedTail === undefined) this.#adoptDisk(sessionId, disk);
      else this.#controllers.delete(sessionId);
      return disk;
    }
    if ((cached.durableRevision as number) !== (disk.inspection.revision as number)) {
      return immutable({
        ...disk,
        inspection: {
          ...disk.inspection,
          state: "corrupt-prefix" as const,
          proposedRepair: undefined,
          message: `session ${sessionId} durable revision changed while memory commits were pending`,
        },
      });
    }
    try {
      const state = stateFromReport(cached.validator.report());
      const tail = cached.events.at(-1);
      return immutable({
        header: disk.header,
        events: cached.events,
        inspection: {
          sessionId,
          state: disk.uncommittedTail
            ? "repairable-tail"
            : state.waiting ? "waiting-input"
            : state.open ? "open-tail" : "healthy",
          revision: cached.revision,
          ...(tail === undefined ? {} : { tailSeq: tail.seq, safeThroughSeq: tail.seq }),
          ...(disk.uncommittedTail || (state.open && !state.waiting)
            ? { proposedRepair: state.open && !state.waiting ? planSessionTailRepair(cached.events) : [] }
            : {}),
          ...(disk.uncommittedTail
            ? { message: "unterminated final commit bytes can be discarded" }
            : {}),
        },
        ...(disk.uncommittedTail === undefined ? {} : { uncommittedTail: disk.uncommittedTail }),
      });
    } catch (error) {
      return immutable({
        header: disk.header,
        events: cached.events,
        inspection: {
          sessionId,
          state: "corrupt-prefix",
          revision: cached.revision,
          message: error instanceof Error ? error.message : String(error),
        },
      });
    }
  }

  async discardUncommittedTail(input: DiscardUncommittedTailInput): Promise<void> {
    this.#active();
    const current = await this.inspect(input.sessionId);
    if (
      current.uncommittedTail === undefined ||
      current.inspection.revision === undefined ||
      (current.inspection.revision as number) !== (input.expectedRevision as number) ||
      current.uncommittedTail.committedByteLength !== input.committedByteLength ||
      current.uncommittedTail.observedByteLength !== input.observedByteLength
    ) {
      fail("TAIL_CONFLICT", `session ${input.sessionId} uncommitted tail changed before repair`);
    }
    await truncate(
      join(this.#sessionDir(input.sessionId), "events.jsonl"),
      input.committedByteLength,
    );
    await this.#syncPath(join(this.#sessionDir(input.sessionId), "events.jsonl"));
    this.#controllers.delete(input.sessionId);
  }

  async flush(sessionId: SessionId): Promise<ReturnType<typeof SessionRevision>> {
    this.#active();
    return this.#flushController(sessionId);
  }

  async list(request: ListSessionsRequest = {}): Promise<SessionListingPage> {
    this.#active();
    await mkdir(this.#root, { recursive: true });
    const entries = await readdir(this.#root, { withFileTypes: true });
    const sessions: SessionListing[] = [];
    for (const entry of entries) {
      if (!entry.isDirectory() || entry.name.startsWith(".")) continue;
      try {
        const inspected = await this.inspect(entry.name as SessionId);
        if (inspected.header === undefined || inspected.inspection.revision === undefined) continue;
        const loaded = {
          header: inspected.header,
          events: inspected.events,
          revision: inspected.inspection.revision,
        };
        if (request.workspaceRootHash !== undefined &&
            loaded.header.workspace?.rootHash !== request.workspaceRootHash) continue;
        const title = [...loaded.events].reverse().find((event) => event.type === "session/title");
        const pin = [...loaded.events].reverse().find((event) => event.type === "session/pin");
        const latestRig = [...loaded.events].reverse().find((event) => event.type === "session/rig");
        const rigId = latestRig === undefined
          ? loaded.header.rigId
          : (latestRig.data as { readonly rigId: string | null }).rigId ?? undefined;
        if (request.rigId !== undefined && rigId !== request.rigId) continue;
        const tail = loaded.events.at(-1);
        sessions.push({
          sessionId: loaded.header.id,
          createdAt: loaded.header.createdAt,
          updatedAt: tail?.time ?? loaded.header.createdAt,
          ...(rigId === undefined ? {} : { rigId }),
          backend: loaded.header.backend,
          fidelity: loaded.header.fidelity,
          revision: loaded.revision,
          ...(tail ? { tailSeq: tail.seq } : {}),
          ...(title ? { title: String((title.data as Record<string, unknown>).title) } : {}),
          ...(loaded.header.parent ? { parentSessionId: loaded.header.parent.sessionId } : {}),
          ...(pin ? { pinned: Boolean((pin.data as Record<string, unknown>).pinned) } : {}),
          health: inspected.inspection.state,
        });
      } catch {
        // Without a valid current-format header there is no trustworthy
        // session identity to expose through the public listing contract.
      }
    }
    sessions.sort((a, b) => b.updatedAt - a.updatedAt || String(a.sessionId).localeCompare(String(b.sessionId)));
    const limit = request.limit ?? 50;
    const cursorIndex = request.cursor === undefined
      ? undefined
      : sessions.findIndex((entry) => String(entry.sessionId) === request.cursor);
    if (
      cursorIndex === -1 ||
      !Number.isSafeInteger(limit) ||
      limit < 1
    ) {
      fail("INVALID_LIST_REQUEST", "invalid session list cursor or limit");
    }
    const start = cursorIndex === undefined ? 0 : cursorIndex + 1;
    const page = sessions.slice(start, start + limit);
    const exhausted = start + page.length >= sessions.length;
    return immutable({
      sessions: page,
      ...(exhausted || page.length === 0 ? {} : { cursor: String(page[page.length - 1]!.sessionId) }),
      exhausted,
    });
  }

  async remove(input: RemoveSessionInput): Promise<void> {
    this.#active();
    const loaded = await this.#load(input.sessionId);
    if (input.expectedRevision !== undefined &&
        (loaded.revision as number) !== (input.expectedRevision as number)) {
      fail("REVISION_CONFLICT", `session ${input.sessionId} revision changed`);
    }
    await rm(this.#sessionDir(input.sessionId), { recursive: true, force: false });
    this.#controllers.delete(input.sessionId);
  }

  async dispose(): Promise<void> {
    if (this.#disposed) return;
    for (const sessionId of this.#controllers.keys()) {
      await this.#flushController(sessionId);
    }
    this.#disposed = true;
    this.#controllers.clear();
  }

  async #load(sessionId: SessionId): Promise<LoadedSession> {
    const cached = this.#controllers.get(sessionId);
    if (cached !== undefined) {
      return {
        header: cached.header,
        events: cached.events,
        revision: cached.revision,
        validation: cached.validator.report(),
      };
    }
    const inspected = await this.inspect(sessionId);
    if (inspected.inspection.state === "corrupt-prefix" || inspected.uncommittedTail !== undefined) {
      fail("CORRUPT_SESSION", inspected.inspection.message ?? `session ${sessionId} is corrupt`);
    }
    if (inspected.inspection.state === "unsupported-format") {
      fail("UNSUPPORTED_FORMAT", inspected.inspection.message ?? `session ${sessionId} format is unsupported`);
    }
    if (inspected.header === undefined || inspected.inspection.revision === undefined) {
      fail("CORRUPT_SESSION", `session ${sessionId} has no readable current-format header`);
    }
    const controller = this.#controllers.get(sessionId);
    if (controller === undefined) {
      fail("CORRUPT_SESSION", `session ${sessionId} was not adopted after validation`);
    }
    return {
      header: controller.header,
      events: controller.events,
      revision: controller.revision,
      validation: controller.validator.report(),
    };
  }

  #adoptDisk(
    sessionId: SessionId,
    disk: PersistenceInspection,
  ): SessionController {
    if (disk.header === undefined || disk.inspection.revision === undefined) {
      fail("CORRUPT_SESSION", `session ${sessionId} cannot be cached`);
    }
    const controller: SessionController = {
      header: disk.header,
      durableRevision: disk.inspection.revision,
      revision: disk.inspection.revision,
      events: [...disk.events],
      validator: this.#validatedInspections.get(disk) ?? createSessionHistoryValidator(),
      pending: [],
    };
    if (this.#validatedInspections.get(disk) === undefined) {
      controller.validator.append(controller.events);
    }
    this.#controllers.set(sessionId, controller);
    return controller;
  }

  async #inspectDisk(sessionId: SessionId): Promise<PersistenceInspection> {
    const dir = this.#sessionDir(sessionId);
    let headerText: string;
    let eventsText: string;
    try {
      [headerText, eventsText] = await Promise.all([
        readFile(join(dir, "header.json"), "utf8"),
        readFile(join(dir, "events.jsonl"), "utf8"),
      ]);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        fail("SESSION_NOT_FOUND", `session ${sessionId} does not exist`);
      }
      throw error;
    }
    let headerValue: unknown;
    try {
      headerValue = JSON.parse(headerText);
    } catch {
      return immutable({
        events: [],
        inspection: {
          sessionId,
          state: "corrupt-prefix",
          message: `session ${sessionId} header is invalid JSON`,
        },
      });
    }
    const headerRecord = objectRecord(headerValue);
    if (headerRecord === undefined) {
      return immutable({
        events: [],
        inspection: {
          sessionId,
          state: "corrupt-prefix",
          message: `session ${sessionId} header is not an object`,
        },
      });
    }
    if (headerRecord.formatVersion !== SESSION_FORMAT_VERSION) {
      return immutable({
        events: [],
        inspection: {
          sessionId,
          state: "unsupported-format",
          message: `session ${sessionId} format ${String(headerRecord.formatVersion)} is unsupported`,
        },
      });
    }
    let header: SessionHeader;
    try {
      header = parseSessionHeader(headerValue);
    } catch (error) {
      return immutable({
        events: [],
        inspection: {
          sessionId,
          state: "corrupt-prefix",
          message: error instanceof Error ? error.message : String(error),
        },
      });
    }
    if (header.id !== sessionId) {
      return immutable({
        header,
        events: [],
        inspection: {
          sessionId,
          state: "corrupt-prefix",
          message: `session directory ${sessionId} contains header for ${header.id}`,
        },
      });
    }

    const finalNewline = eventsText.lastIndexOf("\n");
    const committedText = finalNewline < 0 ? "" : eventsText.slice(0, finalNewline + 1);
    const uncommittedText = finalNewline < 0 ? eventsText : eventsText.slice(finalNewline + 1);
    const lines = committedText.length === 0 ? [] : committedText.slice(0, -1).split("\n");
    const committedByteLength = Buffer.byteLength(committedText);
    const observedByteLength = Buffer.byteLength(eventsText);
    if (lines.length === 0) {
      return immutable({
        header,
        events: [],
        inspection: {
          sessionId,
          state: "corrupt-prefix",
          message: `session ${sessionId} has no committed current-format record`,
        },
      });
    }
    const events: ParsedSessionEvent[] = [];
    const validator = createSessionHistoryValidator();
    let revision = -1;
    for (const [index, line] of lines.entries()) {
      if (line.length === 0) {
        return this.#corruptInspection(header, sessionId, events, revision, `session ${sessionId} commit ${index} is empty`);
      }
      let recordValue: unknown;
      try {
        recordValue = JSON.parse(line);
      } catch {
        return this.#corruptInspection(header, sessionId, events, revision, `session ${sessionId} commit ${index} is invalid JSON`);
      }
      const recordObject = objectRecord(recordValue);
      if (recordObject === undefined) {
        return this.#corruptInspection(header, sessionId, events, revision, `session ${sessionId} commit ${index} is not an object`);
      }
      const record = recordObject as CommitRecord;
      if (record.formatVersion !== SESSION_FORMAT_VERSION) {
        return immutable({
          header,
          events,
          inspection: {
            sessionId,
            state: "unsupported-format",
            ...(revision < 0 ? {} : { revision: SessionRevision(revision) }),
            message: `session ${sessionId} commit ${index} format ${String(record.formatVersion)} is unsupported`,
          },
        });
      }
      if (record.kind !== "commit" || record.revision !== index || !Array.isArray(record.events)) {
        return this.#corruptInspection(header, sessionId, events, revision, `session ${sessionId} commit ${index} violates the current format`);
      }
      try {
        const parsed = record.events.map((event) => parseSessionEvent(event));
        validator.append(parsed);
        events.push(...parsed);
      } catch (error) {
        return this.#corruptInspection(
          header,
          sessionId,
          events,
          revision,
          error instanceof Error ? error.message : String(error),
        );
      }
      revision = record.revision;
    }
    const state = stateFromReport(validator.report());
    const tail = events.at(-1);
    const torn = uncommittedText.length > 0;
    const inspected: PersistenceInspection = immutable({
      header,
      events,
      inspection: {
        sessionId,
        state: torn
          ? "repairable-tail"
          : state.waiting
            ? "waiting-input"
            : state.open ? "repairable-tail" : "healthy",
        revision: SessionRevision(revision),
        ...(tail === undefined ? {} : { tailSeq: tail.seq, safeThroughSeq: tail.seq }),
        ...(torn || (state.open && !state.waiting)
          ? { proposedRepair: state.open && !state.waiting ? planSessionTailRepair(events) : [] }
          : {}),
        ...(torn ? { message: "unterminated final commit bytes can be discarded" } : {}),
      },
      ...(torn
        ? { uncommittedTail: { committedByteLength, observedByteLength } }
        : {}),
    });
    this.#validatedInspections.set(inspected, validator);
    return inspected;
  }

  #corruptInspection(
    header: SessionHeader,
    sessionId: SessionId,
    events: readonly ParsedSessionEvent[],
    revision: number,
    message: string,
  ): PersistenceInspection {
    const tail = events.at(-1);
    return immutable({
      header,
      events,
      inspection: {
        sessionId,
        state: "corrupt-prefix",
        ...(revision < 0 ? {} : { revision: SessionRevision(revision) }),
        ...(tail === undefined ? {} : { tailSeq: tail.seq, safeThroughSeq: tail.seq }),
        message,
      },
    });
  }

  async #controller(sessionId: SessionId): Promise<SessionController> {
    const existing = this.#controllers.get(sessionId);
    if (existing !== undefined) return existing;
    const disk = await this.#inspectDisk(sessionId);
    if (
      disk.inspection.revision === undefined ||
      disk.inspection.state === "corrupt-prefix" ||
      disk.inspection.state === "unsupported-format" ||
      disk.uncommittedTail !== undefined
    ) {
      fail("CORRUPT_SESSION", disk.inspection.message ?? `session ${sessionId} cannot accept writes`);
    }
    if (disk.header === undefined) {
      fail("CORRUPT_SESSION", `session ${sessionId} has no readable current-format header`);
    }
    return this.#adoptDisk(sessionId, disk);
  }

  async #flushController(sessionId: SessionId): Promise<ReturnType<typeof SessionRevision>> {
    const loaded = await this.#load(sessionId);
    const controller = await this.#controller(sessionId);
    const path = join(this.#sessionDir(sessionId), "events.jsonl");
    try {
      if (controller.pending.length > 0) {
        const appendedText = controller.pending.map(commitLine).join("");
        await appendFile(path, appendedText, "utf8");
        controller.durableRevision = SessionRevision(controller.pending.at(-1)!.revision);
        controller.pending.splice(0);
      }
      await this.#syncPath(path);
    } catch (error) {
      this.#controllers.delete(sessionId);
      throw error;
    }
    return loaded.revision;
  }

  async #syncPath(path: string): Promise<void> {
    const handle = await open(path, "r");
    try {
      await handle.sync();
    } finally {
      await handle.close();
    }
  }

  #sessionDir(sessionId: SessionId): string {
    return join(this.#root, safeId(sessionId));
  }

  #active(): void {
    if (this.#disposed) fail("DISPOSED", "session persistence is disposed");
  }
}
