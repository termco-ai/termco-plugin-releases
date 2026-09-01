import {
  SessionId,
  SessionSeq,
  type ParsedSessionEvent,
  type SessionHeader,
} from "@termco/session-base";
import { getTrajectoryRuntime } from "./runtime";

export async function forkSessionFrom(
  sessionId: string,
  eventSeq: number,
): Promise<{ sessionId: string }> {
  const runtime = getTrajectoryRuntime();
  const result = await runtime.history.fork({
    sessionId: SessionId(sessionId),
    boundary: { kind: "event", seq: SessionSeq(eventSeq) },
    origin: "fork",
  });
  if (runtime.aiSessions) await runtime.aiSessions.openSession(result.childSessionId);
  return { sessionId: result.childSessionId };
}

export async function rerunSessionFrom(
  sessionId: string,
  eventSeq: number,
): Promise<{ sessionId: string }> {
  const sessions = getTrajectoryRuntime().aiSessions;
  if (!sessions) throw new Error("AI sessions are not active");
  const result = await sessions.rerunFrom({
    sessionId: SessionId(sessionId),
    eventSeq: SessionSeq(eventSeq),
  });
  return { sessionId: result.childSessionId };
}

export async function openOwningSurface(header: SessionHeader): Promise<void> {
  const runtime = getTrajectoryRuntime();
  if (header.backend === "chat" && runtime.aiSessions) {
    await runtime.aiSessions.openSession(header.id);
    return;
  }
  runtime.codingAgents?.openRun(String(header.id));
}

export type CheckpointReference = {
  readonly checkpointId: string;
  readonly backend: string;
  readonly reference: unknown;
  readonly eventSeq: number;
};

export function lastCheckpointAtOrBefore(
  events: readonly ParsedSessionEvent[],
  eventSeq: number,
): CheckpointReference | null {
  for (let index = events.length - 1; index >= 0; index -= 1) {
    const event = events[index]!;
    if ((event.seq as number) > eventSeq || event.type !== "workspace/checkpoint") continue;
    const data = event.data as Record<string, unknown>;
    return {
      checkpointId: String(data.checkpointId),
      backend: String(data.backend),
      reference: data.reference,
      eventSeq: event.seq as number,
    };
  }
  return null;
}

export async function rewindWorkingTree(
  sessionId: string,
  checkpoint: CheckpointReference,
): Promise<string | null> {
  const agents = getTrajectoryRuntime().codingAgents;
  if (!agents) return "Coding agents are not active";
  const result = await agents.rewindCheckpoint({
    runId: sessionId,
    checkpointId: checkpoint.checkpointId,
    backend: checkpoint.backend,
    reference: checkpoint.reference,
  });
  return result.ok ? null : (result.error ?? "rewind failed");
}
