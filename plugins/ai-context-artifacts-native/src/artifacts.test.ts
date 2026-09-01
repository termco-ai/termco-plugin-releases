import type { StorageCapability, StorageHandle } from "@termco/storage-base";
import {
  SessionId,
  SessionRevision,
  SessionSeq,
  type SessionHistoryCapability,
} from "@termco/session-base";
import { describe, expect, it } from "vitest";
import { createContextArtifacts, OUTPUT_MAX_AGE_MS } from "./artifacts";

function memoryStorage() {
  const data = new Map<string, unknown>();
  const handle: StorageHandle = {
    get: <T = unknown>(key: string) => data.get(key) as T | undefined,
    set: (key, value) => void data.set(key, value),
    has: (key) => data.has(key),
    delete: (key) => data.delete(key),
    keys: () => [...data.keys()],
    values: () => [...data.values()],
    entries: () => [...data.entries()],
    clear: () => data.clear(),
    reset: () => data.clear(),
    save: async () => {},
  };
  return { open: async () => handle, close: async () => {} } satisfies StorageCapability;
}

const sessions = {
  readWindow: async (sessionId: string) => ({
    header: {
      formatVersion: 2 as const,
      id: SessionId(sessionId),
      createdAt: 1,
      authority: "v2" as const,
      backend: "chat",
      fidelity: "full" as const,
    },
    events: sessionId === "missing" ? [] : [
      {
        type: "user/message" as const,
        seq: SessionSeq(0),
        time: 1,
        data: { turn: 1, message: { role: "user", content: "hello" }, source: "human" as const },
        surfaceOp: { op: "append" as const },
      },
      {
        type: "assistant/message" as const,
        seq: SessionSeq(1),
        time: 2,
        data: {
          turn: 1,
          step: 1,
          requestId: "request-1",
          message: { role: "assistant", content: "world" },
          finishReason: "stop",
        },
        surfaceOp: { op: "append" as const },
        sourceEventSeqs: [],
      },
    ],
    revision: SessionRevision(1),
    loadedRange: { start: 0, end: 1 },
    availability: { earlier: false, later: false },
    fidelity: "full" as const,
    repair: { state: "healthy" as const },
  }),
} as unknown as SessionHistoryCapability;

describe("AI context artifacts", () => {
  it("shares redacted parked outputs and pages them", async () => {
    const artifacts = await createContextArtifacts(memoryStorage(), sessions);
    const id = await artifacts.writeToolOutput("bash_run", "one\nsk-proj-abcdefghijklmnopqrstuvwxyz\nthree");
    expect(id).toMatch(/^bash_run-/);
    await expect(artifacts.readToolOutput(id!, { offset: 4, limit: 1 })).resolves.toMatchObject({
      content: expect.stringContaining("<REDACTED>"),
      offset: 4,
      truncated: true,
    });
  });

  it("renders transcripts from the canonical session surface", async () => {
    const artifacts = await createContextArtifacts(memoryStorage(), sessions);
    await expect(artifacts.readTranscript("run-1")).resolves.toMatchObject({
      content: expect.stringMatching(/## User[\s\S]*hello[\s\S]*## Assistant[\s\S]*world/),
    });
    await expect(artifacts.readTranscript("../escape")).resolves.toBeNull();
  });

  it("loads every current-format page before projecting a transcript", async () => {
    const full = await sessions.readWindow(SessionId("run-1"), { kind: "head", limit: 100 });
    const requests: string[] = [];
    const paged = {
      readWindow: async (_sessionId: string, request: { kind: string }) => {
        requests.push(request.kind);
        return request.kind === "head"
          ? {
              ...full,
              events: full.events.slice(0, 1),
              loadedRange: { start: 0, end: 0 },
              availability: { earlier: false, later: true },
            }
          : {
              ...full,
              events: full.events.slice(1),
              loadedRange: { start: 1, end: 1 },
              availability: { earlier: true, later: false },
            };
      },
    } as unknown as SessionHistoryCapability;

    const artifacts = await createContextArtifacts(memoryStorage(), paged);
    await expect(artifacts.readTranscript("run-1")).resolves.toMatchObject({
      content: expect.stringMatching(/hello[\s\S]*world/),
    });
    expect(requests).toEqual(["head", "after"]);
  });

  it("prunes outputs through the one shared retention policy", async () => {
    const originalNow = Date.now;
    Date.now = () => 10;
    try {
      const artifacts = await createContextArtifacts(memoryStorage(), sessions);
      const id = await artifacts.writeToolOutput("read_file", "body");
      await expect(artifacts.pruneToolOutputs(10 + OUTPUT_MAX_AGE_MS + 1)).resolves.toEqual([id]);
      await expect(artifacts.readToolOutput(id!)).resolves.toBeNull();
    } finally {
      Date.now = originalNow;
    }
  });
});
