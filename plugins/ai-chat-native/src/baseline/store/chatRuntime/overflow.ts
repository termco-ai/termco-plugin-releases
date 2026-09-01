import type { ErrorDetail } from "../../lib/agent/errorMessage";
import { classifyOverflow, type OverflowInfo } from "../../lib/agent/overflowError";

const NOTE_TTL_MS = 30_000;
const notes = new Map<string, { info: OverflowInfo; at: number }>();

export function noteStreamError(sessionId: string, error: unknown, detail: ErrorDetail): void {
  const info = classifyOverflow(error, detail);
  if (info) notes.set(sessionId, { info, at: Date.now() });
}

export function takeStreamOverflow(sessionId: string): OverflowInfo | null {
  const note = notes.get(sessionId);
  if (!note) return null;
  notes.delete(sessionId);
  return Date.now() - note.at <= NOTE_TTL_MS ? note.info : null;
}

export function clearStreamOverflow(sessionId: string): void { notes.delete(sessionId); }
export function resetOverflowNotes(): void { notes.clear(); }
