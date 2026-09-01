import {
  SESSION_FORMAT_VERSION,
  SessionId,
  type AppendSessionEvent,
  type JsonValue,
  type SessionHistoryCapability,
} from "@termco/session-base";

type SessionLane = { chain: Promise<void> };
const lanes = new Map<string, SessionLane>();
let history: SessionHistoryCapability | null = null;

export function codingAgentSessionJournalActive(): boolean {
  return history !== null;
}

export function configureAgentSessionJournal(next: SessionHistoryCapability | null): void {
  history = next;
  if (!next) lanes.clear();
}

function json(value: unknown): JsonValue {
  const encoded = JSON.stringify(value);
  return encoded === undefined ? null : JSON.parse(encoded) as JsonValue;
}

function enqueue(sessionId: string, operation: (owner: SessionHistoryCapability) => Promise<void>): void {
  const owner = history;
  if (!owner) return;
  const lane = lanes.get(sessionId) ?? { chain: Promise.resolve() };
  lane.chain = lane.chain
    .then(() => operation(owner))
    .catch((error) => {
      console.error(`[coding-agent] failed to record session ${sessionId}`, error);
    });
  lanes.set(sessionId, lane);
}

function missing(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error &&
    (error as { code?: unknown }).code === "SESSION_NOT_FOUND";
}

export function ensureAgentSession(
  sessionId: string,
  header: () => {
    readonly backend: string;
    readonly model?: string;
    readonly rigId?: string;
    readonly startedAt: number;
    readonly title?: string;
  },
): void {
  enqueue(sessionId, async (owner) => {
    try {
      await owner.inspect(SessionId(sessionId));
      return;
    } catch (error) {
      if (!missing(error)) throw error;
    }
    const input = header();
    const createdAt = input.startedAt;
    const seed: AppendSessionEvent[] = [
      ...(input.title
        ? [{
            type: "session/title" as const,
            time: createdAt,
            data: { title: input.title, source: "system" as const },
          }]
        : []),
      {
        type: "adapter/event",
        time: createdAt,
        data: {
          adapter: "coding-agent-native",
          kind: "session-start",
          payload: json({ model: input.model }),
        },
      },
    ];
    await owner.create({
      header: {
        formatVersion: SESSION_FORMAT_VERSION,
        id: SessionId(sessionId),
        createdAt,
        authority: "v2",
        backend: input.backend,
        fidelity: "adapter",
        ...(input.rigId ? { rigId: input.rigId } : {}),
      },
      seed,
      durability: "written",
    });
  });
}

export function recordAgentEvent(sessionId: string, kind: string, payload: unknown): void {
  enqueue(sessionId, async (owner) => {
    await owner.append(SessionId(sessionId), [{
      type: "adapter/event",
      time: Date.now(),
      data: { adapter: "coding-agent-native", kind, payload: json(payload) },
    }], { durability: "written" });
  });
}

export function recordAgentCheckpoint(
  sessionId: string,
  input: { readonly checkpointId: string; readonly backend: string; readonly reference: unknown; readonly summary?: string },
): void {
  enqueue(sessionId, async (owner) => {
    await owner.append(SessionId(sessionId), [{
      type: "workspace/checkpoint",
      time: Date.now(),
      data: {
        checkpointId: input.checkpointId,
        backend: input.backend,
        reference: json(input.reference),
        ...(input.summary ? { summary: input.summary } : {}),
      },
    }], { durability: "written" });
  });
}

export function resetSessionJournal(): void {
  lanes.clear();
}

export function sessionJournalSettled(sessionId: string): Promise<void> {
  return lanes.get(sessionId)?.chain ?? Promise.resolve();
}
