import { createHash } from "node:crypto";
import type {
  AiContextArtifactsCapability,
  AiContextArtifactSlice,
} from "@termco/ai-sessions-base";
import type { StorageCapability } from "@termco/storage-base";
import {
  SessionId,
  foldSurface,
  projectChat,
  type CanonicalChatProjectionMessage,
  type JsonValue,
  type SessionHistoryCapability,
  type SessionWindow,
} from "@termco/session-base";

const OUTPUT_PREFIX = "output:";
const DEFAULT_OUTPUT_LIMIT = 400;
export const OUTPUT_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1_000;
const ID_RE = /^[A-Za-z0-9_-]+$/;
const MAX_PAYLOAD_CHARS = 200_000;

type StoredOutput = { content: string; touchedAt: number };

const REDACTIONS: RegExp[] = [
  /\bsk-(?:proj-)?[A-Za-z0-9_-]{20,}\b/g,
  /\bsk-ant-[A-Za-z0-9_-]{20,}\b/g,
  /\b(?:AKIA|ASIA)[0-9A-Z]{16}\b/g,
  /\bgh[opsur]_[A-Za-z0-9]{36,}\b/g,
  /\bgithub_pat_[A-Za-z0-9_]{40,}\b/g,
  /\bAIza[0-9A-Za-z_-]{35}\b/g,
  /\bxox[bpsare]-[A-Za-z0-9-]{10,}\b/g,
  /\b(?:sk|pk|rk)_(?:live|test)_[A-Za-z0-9]{24,}\b/g,
  /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/g,
  /\bBearer\s+[A-Za-z0-9._-]{20,}/g,
];
const ENV_SECRET = /\b((?:[A-Z][A-Z0-9_]*)?(?:API[_-]?KEY|SECRET(?:[_-]?KEY)?|ACCESS[_-]?TOKEN|AUTH[_-]?TOKEN|PASSWORD|PASSWD|PRIVATE[_-]?KEY|CLIENT[_-]?SECRET)[A-Z0-9_]*)\s*[:=]\s*(["']?)([^\s"';|&]+)\2/gi;

export function redactSensitive(text: string): string {
  let redacted = text;
  for (const pattern of REDACTIONS) redacted = redacted.replace(pattern, "<REDACTED>");
  return redacted.replace(
    ENV_SECRET,
    (_match, name: string, quote: string) => `${name}=${quote}<REDACTED>${quote}`,
  );
}

function validId(id: string): boolean {
  return ID_RE.test(id) && id.length <= 200;
}

function sliceText(
  body: string,
  options: { offset?: number; limit?: number } = {},
  defaultLimit?: number,
): AiContextArtifactSlice {
  const lines = body.split("\n");
  const offset = Math.max(1, Math.floor(options.offset ?? 1));
  const requested = options.limit ?? defaultLimit;
  const limit = requested != null && requested > 0 ? Math.floor(requested) : undefined;
  const start = offset - 1;
  const selected = limit == null ? lines.slice(start) : lines.slice(start, start + limit);
  return {
    content: selected.join("\n"),
    offset,
    totalLines: lines.length,
    truncated: start + selected.length < lines.length,
  };
}

function valueText(value: unknown): string {
  if (typeof value === "string") return value;
  try {
    return JSON.stringify(value, null, 1) ?? String(value);
  } catch {
    return String(value);
  }
}

function capped(value: string): string {
  return value.length > MAX_PAYLOAD_CHARS
    ? `${value.slice(0, MAX_PAYLOAD_CHARS)}\n[…truncated]`
    : value;
}

function canonicalMessageText(message: CanonicalChatProjectionMessage): string {
  const value = message.message;
  if (typeof value === "string") return value;
  if (typeof value !== "object" || value === null || Array.isArray(value)) return valueText(value);
  const object = value as Readonly<Record<string, JsonValue>>;
  if (typeof object.content === "string") return object.content;
  if (!Array.isArray(object.parts)) return valueText(value);
  return object.parts
    .flatMap((part: JsonValue) => {
      if (typeof part === "string") return [part];
      if (typeof part !== "object" || part === null || Array.isArray(part)) return [];
      const objectPart = part as Readonly<Record<string, JsonValue>>;
      if (objectPart.type === "reasoning") return [];
      if (typeof objectPart.text === "string") return [objectPart.text];
      return [valueText(part)];
    })
    .join("\n");
}

export function renderSessionTranscript(messages: readonly CanonicalChatProjectionMessage[]): string {
  const out: string[] = [];
  for (const message of messages) {
    out.push(`## ${message.role === "user" ? "User" : message.role === "assistant" ? "Assistant" : message.role === "tool" ? "Tool" : "Compaction"}`);
    out.push(capped(canonicalMessageText(message)));
    out.push("");
  }
  return out.join("\n");
}

async function readCompleteSession(
  sessions: SessionHistoryCapability,
  sessionId: string,
): Promise<Pick<SessionWindow, "header" | "events">> {
  const first = await sessions.readWindow(SessionId(sessionId), { kind: "head", limit: 512 });
  const events = [...first.events];
  let page = first;
  while (page.availability.later) {
    const last = events.at(-1);
    if (!last) throw new Error("session page reported later events without a continuation sequence");
    const next = await sessions.readWindow(SessionId(sessionId), {
      kind: "after",
      seq: last.seq,
      limit: 512,
    });
    if (next.revision !== first.revision || next.header.id !== first.header.id) {
      throw new Error("session changed while building transcript");
    }
    if (next.events.length === 0) throw new Error("session paging did not advance");
    events.push(...next.events);
    page = next;
  }
  return { header: first.header, events };
}

export async function createContextArtifacts(
  storage: StorageCapability,
  sessions: SessionHistoryCapability,
  storeName = "ai-context-artifacts.json",
): Promise<AiContextArtifactsCapability> {
  const store = await storage.open(storeName);
  return {
    async writeToolOutput(toolName, body) {
      if (!body.trim()) return null;
      const tag = toolName.replace(/[^A-Za-z0-9_-]/g, "").slice(0, 24) || "tool";
      const hash = createHash("sha256").update(body).digest("hex").slice(0, 20);
      const id = `${tag}-${hash}`;
      store.set(`${OUTPUT_PREFIX}${id}`, {
        content: redactSensitive(`# ${toolName}\n\n${body}`),
        touchedAt: Date.now(),
      } satisfies StoredOutput);
      await store.save();
      return id;
    },
    async readToolOutput(id, options = {}) {
      if (!validId(id)) return null;
      const record = store.get<StoredOutput>(`${OUTPUT_PREFIX}${id}`);
      if (!record || typeof record.content !== "string") return null;
      return sliceText(record.content, options, DEFAULT_OUTPUT_LIMIT);
    },
    async readTranscript(runId, options = {}) {
      if (!validId(runId)) return null;
      try {
        const session = await readCompleteSession(sessions, runId);
        const { events } = session;
        if (events.length === 0) return null;
        const body = redactSensitive(renderSessionTranscript(projectChat(session.header, foldSurface(events)).messages));
        return body.trim() ? sliceText(body, options) : null;
      } catch {
        return null;
      }
    },
    async pruneToolOutputs(now = Date.now()) {
      const removed: string[] = [];
      for (const [key, value] of store.entries()) {
        if (!key.startsWith(OUTPUT_PREFIX)) continue;
        const record = value as Partial<StoredOutput>;
        if (typeof record.touchedAt !== "number") continue;
        if (now - record.touchedAt < OUTPUT_MAX_AGE_MS) continue;
        store.delete(key);
        removed.push(key.slice(OUTPUT_PREFIX.length));
      }
      if (removed.length) await store.save();
      return removed;
    },
  };
}
