import type { AiToolRuntime } from "@termco/ai-tools-base";
import {
  SessionId,
  SessionSeq,
  type SessionModelQueryCapability,
} from "@termco/session-base";
import { describe, expect, it, vi } from "vitest";
import { createSessionQueryContribution } from "./tools";

function modelQuery(): SessionModelQueryCapability {
  return {
    search: vi.fn(async () => ({
      results: [],
      redaction: { count: 0, categories: [], truncated: false },
      truncated: false,
    })),
    traceSession: vi.fn(async () => null),
    readEvent: vi.fn(async () => null),
    explainEvent: vi.fn(async () => null),
  };
}

describe("model session query tools", () => {
  it("registers five bounded schemas without provider cursor, workspace, path, or limit controls", () => {
    const tools = createSessionQueryContribution(modelQuery()).build({
      getSessionId: () => "caller",
    });

    expect(Object.keys(tools)).toEqual([
      "session_search",
      "session_event_search",
      "session_trace",
      "session_event_trace",
      "session_event_read",
    ]);
    const schemas = JSON.stringify(Object.values(tools).map((tool) => tool.inputSchema));
    for (const forbidden of ["cursor", "workspace", "rootPath", "path", "limit"]) {
      expect(schemas).not.toContain(`\"${forbidden}\"`);
    }
    expect(Object.values(tools).every((tool) =>
      (tool.inputSchema as { additionalProperties?: boolean }).additionalProperties === false
    )).toBe(true);
  });

  it("derives caller identity from the tool runtime and ignores caller-controlled scope fields", async () => {
    const query = modelQuery();
    const runtime: AiToolRuntime = { getSessionId: () => "caller" };
    const tools = createSessionQueryContribution(query).build(runtime);

    await tools.session_event_search.execute?.({
      text: "needle",
      sessionId: "target",
      callerSessionId: "forged",
      workspaceRootHash: "forged-workspace",
      cursor: "forged-cursor",
      limit: 1_000,
    });

    expect(query.search).toHaveBeenCalledWith({
      callerSessionId: SessionId("caller"),
      targetSessionId: SessionId("target"),
      text: "needle",
      signal: expect.any(AbortSignal),
    });
  });

  it("uses indistinguishable missing results for exact read and trace tools", async () => {
    const query = modelQuery();
    const tools = createSessionQueryContribution(query).build({ getSessionId: () => "caller" });

    await expect(tools.session_trace.execute?.({ sessionId: "missing" })).resolves.toEqual({ found: false });
    await expect(tools.session_event_trace.execute?.({ sessionId: "missing", seq: 7 })).resolves.toEqual({ found: false });
    await expect(tools.session_event_read.execute?.({ sessionId: "missing", seq: 7 })).resolves.toEqual({ found: false });
    expect(query.readEvent).toHaveBeenCalledWith(expect.objectContaining({
      callerSessionId: SessionId("caller"),
      sessionId: SessionId("missing"),
      seq: SessionSeq(7),
    }));
  });

  it("does not query when the AI session has no caller identity", async () => {
    const query = modelQuery();
    const tools = createSessionQueryContribution(query).build({});

    await expect(tools.session_search.execute?.({ text: "needle" })).resolves.toEqual({
      error: "session query is unavailable",
    });
    expect(query.search).not.toHaveBeenCalled();
  });

  it("rejects storage-like target ids before calling the provider", async () => {
    const query = modelQuery();
    const tools = createSessionQueryContribution(query).build({ getSessionId: () => "caller" });

    await expect(tools.session_event_read.execute?.({
      sessionId: "../../session.jsonl",
      seq: 0,
    })).resolves.toEqual({ found: false });
    expect(query.readEvent).not.toHaveBeenCalled();
  });
});
