import type { UIMessage } from "@ai-sdk/react";
import type { CompactionPolicyState, JsonObject } from "@termco/session-base";
import {
  loadOwnedWorkspaceSnapshot,
  loadSessionState,
  saveOwnedWorkspaceSnapshot,
  saveSessionState,
} from "./runtime";
import type { SerializedTab } from "./baseline/lib/workspaceSerialization";

export type { SerializedTab } from "./baseline/lib/workspaceSerialization";

/**
 * Must match `DEFAULT_RIG_ID` in `@/modules/tabs` — kept as a local literal so
 * this low-level UI-state module stays dependency-free. It is also the assigned
 * "home" rig for chats whose rig was deleted (see `reassignRig`).
 */
export const DEFAULT_RIG_ID = "default";

/**
 * Rebuildable UI view of canonical compaction events. The actual summary,
 * replacement range, provenance, and source lineage live only in
 * `session.history`; this object is never a persistence authority.
 */
export type SessionCompaction = {
  /** The chain, oldest first. More than one = grown incrementally. */
  blocks: string[];
  /**
   * Every canonical source session in this compaction lineage, oldest first.
   */
  transcriptIds?: string[];
  sourceSessionId: string;
  /**
   * Who asked. This decides whether the prompt tells the model to resume
   * without acknowledging the summary: on a manual `/compact` the user is
   * sitting right there, and being told "don't mention it" is wrong.
   */
  trigger?: "auto" | "manual";
  /** Which compaction of this lineage — 1 is the first. Drives the "this thread
   * has been compacted N times" warning. */
  round?: number;
  /** UI messages the summary replaced. */
  droppedCount: number;
  /** UI messages carried over verbatim. 0 on sessions predating the tail. */
  tailCount?: number;
  /** Exchanges on either side — the honest numbers for the card. */
  summarizedGroups?: number;
  preservedGroups?: number;
  preTokens?: number;
  durationMs?: number;
  at: number;
};

export type SessionMeta = {
  id: string;
  title: string;
  /** The rig this chat is tagged with (a filter, not exclusive ownership). */
  rigId: string;
  createdAt: number;
  updatedAt: number;
  /** Rebuildable view derived from canonical compaction events; never persisted. */
  compaction?: SessionCompaction;
  /** Rebuildable view of typed `compaction/policy` events; never persisted here. */
  compactionPolicy?: CompactionPolicyState;
};

const KEY_ACTIVE_BY_RIG = "activeByRig";

/**
 * A frozen snapshot of a rig's workspace (its serialized tabs) captured while
 * a chat was active, so the chat can offer to reopen "the situation from then".
 */
export type SessionSnapshot = {
  tabs: SerializedTab[];
  capturedAt: number;
};

/** rigId → the active session id for that rig. */
export type ActiveByRig = Record<string, string | null>;

function isCurrentActiveByRig(value: unknown): value is ActiveByRig {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  return Object.values(value).every(
    (sessionId) => sessionId === null || typeof sessionId === "string",
  );
}

export async function loadActiveByRig(): Promise<ActiveByRig> {
  const entries = Object.entries(await loadSessionState());
  let activeByRig: ActiveByRig = {};
  for (const [k, v] of entries) {
    if (k === KEY_ACTIVE_BY_RIG && isCurrentActiveByRig(v)) activeByRig = v;
  }
  return activeByRig;
}

export async function saveActiveByRig(map: ActiveByRig): Promise<void> {
  await saveSessionState(KEY_ACTIVE_BY_RIG, map);
}

export async function saveSnapshot(
  id: string,
  snapshot: SessionSnapshot,
): Promise<void> {
  await saveOwnedWorkspaceSnapshot(id, snapshot as unknown as JsonObject);
}

export async function loadSnapshot(
  id: string,
): Promise<SessionSnapshot | null> {
  return await loadOwnedWorkspaceSnapshot(id) as SessionSnapshot | null;
}

export function newSessionId(): string {
  return `s-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export function deriveTitle(messages: UIMessage[]): string {
  for (const m of messages) {
    if (m.role !== "user") continue;
    for (const p of m.parts) {
      if (p.type !== "text") continue;
      const text = (p as { text: string }).text
        .replace(/<terminal-context[\s\S]*?<\/terminal-context>\s*/g, "")
        .replace(/<selection[\s\S]*?<\/selection>\s*/g, "")
        .replace(/<file[\s\S]*?<\/file>\s*/g, "")
        .trim();
      if (!text) continue;
      const first = text.split("\n")[0].trim();
      return first.length > 40 ? `${first.slice(0, 40)}…` : first;
    }
  }
  return "New chat";
}
