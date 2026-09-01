import { describe, expect, it, vi } from "vitest";
import {
  createProtocol,
  LATEST_PROTOCOL_VERSION,
  McpToolError,
  negotiateProtocolVersion,
  SUPPORTED_PROTOCOL_VERSIONS,
  type ProtocolDeps,
} from "./protocol";
import type { TokenIdentity } from "./tokens";

const RUN: TokenIdentity = { kind: "run", token: "t", runId: "r1", rigId: "rig-A", autoApprove: false };
const USER_UNSCOPED: TokenIdentity = {
  kind: "user",
  id: "u1",
  label: "opencode",
  rigId: null,
  autoApprove: false,
};

function make(overrides: Partial<ProtocolDeps> = {}) {
  let sessionSeq = 0;
  const callTool = vi.fn(async () => ({ ok: true }));
  const deps: ProtocolDeps = {
    serverVersion: "9.9.9",
    newSessionId: () => `sess-${++sessionSeq}`,
    builtinTools: {
      getContext: { name: "get_context", description: "", inputSchema: {} },
      selectRig: { name: "select_rig", description: "", inputSchema: {} },
    },
    toolsFor: () => [{ name: "focus_view", description: "", inputSchema: {} }],
    resolveRig: (identity, cwd) =>
      identity.kind === "run"
        ? { rigId: identity.rigId, rigName: "A" }
        : cwd
          ? { rigId: "rig-cwd", rigName: "byCwd" }
          : null,
    callTool,
    ...overrides,
  };
  return { protocol: createProtocol(deps), callTool, deps };
}

async function initialize(protocol: ReturnType<typeof make>["protocol"], identity: TokenIdentity) {
  const res = await protocol.handleRequest(identity, undefined, {
    jsonrpc: "2.0",
    id: 1,
    method: "initialize",
  });
  return res.sessionId!;
}

describe("initialize + session", () => {
  it("mints a session id and returns protocol/capabilities/serverInfo", async () => {
    const { protocol } = make();
    const res = await protocol.handleRequest(RUN, undefined, {
      jsonrpc: "2.0",
      id: 1,
      method: "initialize",
    });
    expect(res.sessionId).toBeTruthy();
    // With no requested version, we answer with our latest.
    expect((res.body as { result: { protocolVersion: string } }).result.protocolVersion).toBe(
      LATEST_PROTOCOL_VERSION,
    );
    expect((res.body as { result: { serverInfo: { version: string } } }).result.serverInfo.version).toBe(
      "9.9.9",
    );
  });

  it("advertises 2025-11-25 as the current latest protocol", () => {
    expect(LATEST_PROTOCOL_VERSION).toBe("2025-11-25");
    expect(SUPPORTED_PROTOCOL_VERSIONS[0]).toBe("2025-11-25");
  });

  it("negotiates the protocol version: echoes a supported request, else latest", async () => {
    // Pure negotiation.
    expect(negotiateProtocolVersion("2025-06-18")).toBe("2025-06-18");
    expect(negotiateProtocolVersion("2025-11-25")).toBe("2025-11-25");
    expect(negotiateProtocolVersion("1999-01-01")).toBe(LATEST_PROTOCOL_VERSION);
    expect(negotiateProtocolVersion(undefined)).toBe(LATEST_PROTOCOL_VERSION);

    // End to end: a client asking for an older-but-supported version gets it
    // echoed back (so it doesn't think the server is incompatible).
    const { protocol } = make();
    const res = await protocol.handleRequest(RUN, undefined, {
      jsonrpc: "2.0",
      id: 1,
      method: "initialize",
      params: { protocolVersion: "2025-06-18" },
    });
    expect((res.body as { result: { protocolVersion: string } }).result.protocolVersion).toBe(
      "2025-06-18",
    );
  });

  it("notifications/initialized → 202, no body", async () => {
    const { protocol } = make();
    const res = await protocol.handleRequest(RUN, undefined, {
      jsonrpc: "2.0",
      method: "notifications/initialized",
    });
    expect(res.status).toBe(202);
    expect(res.body).toBeNull();
  });

  it("a request without a valid session id → 404 (client re-initializes)", async () => {
    const { protocol } = make();
    const res = await protocol.handleRequest(RUN, "bogus", {
      jsonrpc: "2.0",
      id: 2,
      method: "ping",
    });
    expect(res.status).toBe(404);
  });

  it("a session may not be used by a DIFFERENT identity", async () => {
    const { protocol } = make();
    const sid = await initialize(protocol, RUN);
    const res = await protocol.handleRequest(USER_UNSCOPED, sid, {
      jsonrpc: "2.0",
      id: 3,
      method: "ping",
    });
    expect(res.status).toBe(404);
  });

  it("DELETE ends the session", async () => {
    const { protocol } = make();
    const sid = await initialize(protocol, RUN);
    expect(protocol.endSession(sid)).toBe(true);
    const res = await protocol.handleRequest(RUN, sid, {
      jsonrpc: "2.0",
      id: 4,
      method: "ping",
    });
    expect(res.status).toBe(404);
  });
});

describe("stateless operation (no Mcp-Session-Id — forward-compat with 2026-07-28)", () => {
  it("a SENT-but-unknown session id is still 404 (re-init), but NO session id is allowed", async () => {
    const { protocol } = make();
    // Sent an invalid id → the client must re-initialize.
    expect(
      (await protocol.handleRequest(RUN, "bogus", { jsonrpc: "2.0", id: 1, method: "ping" }))
        .status,
    ).toBe(404);
    // Sent no id at all → stateless path, allowed.
    expect(
      (await protocol.handleRequest(RUN, undefined, { jsonrpc: "2.0", id: 2, method: "ping" }))
        .status,
    ).toBe(200);
  });

  it("tools/list works statelessly (no initialize handshake)", async () => {
    const { protocol } = make();
    const res = await protocol.handleRequest(USER_UNSCOPED, undefined, {
      jsonrpc: "2.0",
      id: 1,
      method: "tools/list",
    });
    const names = (res.body as { result: { tools: { name: string }[] } }).result.tools.map(
      (t) => t.name,
    );
    expect(names).toContain("focus_view");
  });

  it("a run token dispatches a tool call with NO session (rig fixed by the token)", async () => {
    const { protocol, callTool } = make();
    await protocol.handleRequest(RUN, undefined, {
      jsonrpc: "2.0",
      id: 1,
      method: "tools/call",
      params: { name: "focus_view", arguments: {} },
    });
    expect(callTool).toHaveBeenCalledWith(
      expect.objectContaining({ rig: { rigId: "rig-A", rigName: "A" } }),
    );
  });

  it("an unscoped user token stateless-calling select_rig gets a stateless-no-session error", async () => {
    const { protocol } = make();
    const res = await protocol.handleRequest(USER_UNSCOPED, undefined, {
      jsonrpc: "2.0",
      id: 1,
      method: "tools/call",
      params: { name: "select_rig", arguments: { cwd: "/srv/app" } },
    });
    const result = (res.body as { result: { isError: boolean; content: { text: string }[] } })
      .result;
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("stateless-no-session");
  });
});

describe("tools/list per identity", () => {
  it("run tokens do NOT see select_rig (rig is fixed)", async () => {
    const { protocol } = make();
    const sid = await initialize(protocol, RUN);
    const res = await protocol.handleRequest(RUN, sid, {
      jsonrpc: "2.0",
      id: 5,
      method: "tools/list",
    });
    const names = (res.body as { result: { tools: { name: string }[] } }).result.tools.map(
      (t) => t.name,
    );
    expect(names).toContain("focus_view");
    expect(names).not.toContain("select_rig");
  });

  it("unscoped user tokens DO see select_rig", async () => {
    const { protocol } = make();
    const sid = await initialize(protocol, USER_UNSCOPED);
    const res = await protocol.handleRequest(USER_UNSCOPED, sid, {
      jsonrpc: "2.0",
      id: 6,
      method: "tools/list",
    });
    const names = (res.body as { result: { tools: { name: string }[] } }).result.tools.map(
      (t) => t.name,
    );
    expect(names).toContain("select_rig");
  });
});

describe("tools/call", () => {
  it("run token: dispatches to callTool with the fixed rig", async () => {
    const { protocol, callTool } = make();
    const sid = await initialize(protocol, RUN);
    await protocol.handleRequest(RUN, sid, {
      jsonrpc: "2.0",
      id: 7,
      method: "tools/call",
      params: { name: "focus_view", arguments: { id: "t1" } },
    });
    expect(callTool).toHaveBeenCalledWith(
      expect.objectContaining({
        toolName: "focus_view",
        rig: { rigId: "rig-A", rigName: "A" },
        input: { id: "t1" },
      }),
    );
  });

  it("unscoped user token: rig-unresolved teach-error before select_rig", async () => {
    const { protocol, callTool } = make();
    const sid = await initialize(protocol, USER_UNSCOPED);
    const res = await protocol.handleRequest(USER_UNSCOPED, sid, {
      jsonrpc: "2.0",
      id: 8,
      method: "tools/call",
      params: { name: "focus_view", arguments: {} },
    });
    expect(callTool).not.toHaveBeenCalled();
    const result = (res.body as { result: { isError: boolean; content: { text: string }[] } }).result;
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("rig-unresolved");
  });

  it("select_rig sets the session cwd; a later call then resolves", async () => {
    const { protocol, callTool } = make();
    const sid = await initialize(protocol, USER_UNSCOPED);
    await protocol.handleRequest(USER_UNSCOPED, sid, {
      jsonrpc: "2.0",
      id: 9,
      method: "tools/call",
      params: { name: "select_rig", arguments: { cwd: "/srv/app" } },
    });
    await protocol.handleRequest(USER_UNSCOPED, sid, {
      jsonrpc: "2.0",
      id: 10,
      method: "tools/call",
      params: { name: "focus_view", arguments: {} },
    });
    expect(callTool).toHaveBeenCalledWith(
      expect.objectContaining({ rig: { rigId: "rig-cwd", rigName: "byCwd" } }),
    );
  });

  it("a tool error is returned as an isError tool result, not a transport error", async () => {
    const { protocol } = make({
      callTool: async () => {
        throw new McpToolError("terminal not open", "no-terminal");
      },
    });
    const sid = await initialize(protocol, RUN);
    const res = await protocol.handleRequest(RUN, sid, {
      jsonrpc: "2.0",
      id: 11,
      method: "tools/call",
      params: { name: "terminal_run", arguments: { command: "ls" } },
    });
    const result = (res.body as { result: { isError: boolean; content: { text: string }[] } }).result;
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("[no-terminal] terminal not open");
  });

  it("wraps a bare string tool result into a text content block", async () => {
    const { protocol } = make({ callTool: async () => "hello world" });
    const sid = await initialize(protocol, RUN);
    const res = await protocol.handleRequest(RUN, sid, {
      jsonrpc: "2.0",
      id: 12,
      method: "tools/call",
      params: { name: "focus_view", arguments: {} },
    });
    expect((res.body as { result: { content: { type: string; text: string }[] } }).result.content).toEqual([
      { type: "text", text: "hello world" },
    ]);
  });

  it("unknown method → JSON-RPC -32601", async () => {
    const { protocol } = make();
    const sid = await initialize(protocol, RUN);
    const res = await protocol.handleRequest(RUN, sid, {
      jsonrpc: "2.0",
      id: 13,
      method: "does/not/exist",
    });
    expect((res.body as { error: { code: number } }).error.code).toBe(-32601);
  });
});
// Owned by the mcp-server-native provider plugin.
