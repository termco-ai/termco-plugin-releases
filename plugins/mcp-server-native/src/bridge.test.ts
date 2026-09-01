import { describe, expect, it, vi } from "vitest";
import { createMcpBridge, type SurfaceEntry } from "./bridge";
import type { ResolvedRig } from "./protocol";
import type { TokenIdentity } from "./tokens";

const RUN: TokenIdentity = { kind: "run", token: "t", runId: "r1", rigId: "rig-A", autoApprove: false };
const USER: TokenIdentity = {
  kind: "user",
  id: "u1",
  label: "opencode",
  rigId: null,
  autoApprove: false,
};
const RIG: ResolvedRig = { rigId: "rig-A", rigName: "A" };

const SURFACE: SurfaceEntry[] = [
  { name: "list_tabs", description: "list", inputSchema: {}, needsApproval: false, runOnly: false },
  { name: "terminal_run", description: "run", inputSchema: {}, needsApproval: true, runOnly: false },
  { name: "ask_user", description: "ask", inputSchema: {}, needsApproval: false, runOnly: true },
];

/** A fake renderer wire: whatever the bridge "sends", we auto-reply with. */
function makeBridge(opts: {
  hasWindow?: boolean;
  autoReply?: (req: { requestId: string; toolName: string; input: unknown }) => void;
  timeoutMs?: number;
  approvalGate?: Parameters<typeof createMcpBridge>[0]["approvalGate"];
}) {
  const sender = { isDestroyed: () => false } as unknown as import("electron").WebContents;
  const bridge = createMcpBridge({
    senders: () => (opts.hasWindow === false ? [] : [sender]),
    send: (_s, request) => {
      opts.autoReply?.(request as { requestId: string; toolName: string; input: unknown });
    },
    timeoutMs: opts.timeoutMs,
    approvalGate: opts.approvalGate,
  });
  bridge.setSurface(SURFACE);
  return bridge;
}

describe("bridge.listTools", () => {
  it("hides run-only tools from user tokens; shows them to run tokens", () => {
    const bridge = makeBridge({});
    expect(bridge.provider.listTools(USER).map((t) => t.name)).toEqual(["list_tabs", "terminal_run"]);
    expect(bridge.provider.listTools(RUN).map((t) => t.name)).toContain("ask_user");
  });
});

describe("bridge.callTool", () => {
  it("round-trips a request to the renderer and returns its result", async () => {
    const bridge = makeBridge({
      autoReply: (req) => bridge.resolveResult({ requestId: req.requestId, ok: true, result: { tabs: [] } }),
    });
    const result = await bridge.provider.callTool({
      identity: RUN,
      rig: RIG,
      toolName: "list_tabs",
      input: {},
    });
    expect(result).toEqual({ tabs: [] });
  });

  it("maps a renderer error reply to an McpToolError", async () => {
    const bridge = makeBridge({
      autoReply: (req) =>
        bridge.resolveResult({
          requestId: req.requestId,
          ok: false,
          error: { code: "no-terminal", message: "no terminal in this rig" },
        }),
    });
    await expect(
      bridge.provider.callTool({ identity: RUN, rig: RIG, toolName: "terminal_run", input: { command: "ls" } }),
    ).rejects.toThrow("no terminal in this rig");
  });

  it("errors with rig-not-active when no window can execute", async () => {
    const bridge = makeBridge({ hasWindow: false });
    await expect(
      bridge.provider.callTool({ identity: RUN, rig: RIG, toolName: "list_tabs", input: {} }),
    ).rejects.toThrow(/not loaded in any app window/);
  });

  it("times out when the renderer never replies", async () => {
    const bridge = makeBridge({ autoReply: () => {}, timeoutMs: 20 });
    await expect(
      bridge.provider.callTool({ identity: RUN, rig: RIG, toolName: "list_tabs", input: {} }),
    ).rejects.toThrow(/did not respond in time/);
    expect(bridge._pendingCount()).toBe(0);
  });

  it("refuses a run-only tool for a user token before dispatching", async () => {
    const send = vi.fn();
    const bridge = createMcpBridge({ senders: () => [{ isDestroyed: () => false } as never], send });
    bridge.setSurface(SURFACE);
    await expect(
      bridge.provider.callTool({ identity: USER, rig: RIG, toolName: "ask_user", input: {} }),
    ).rejects.toThrow(/only available to managed runs/);
    expect(send).not.toHaveBeenCalled();
  });

  it("lets the durable renderer call request approval before reporting denial", async () => {
    let bridge: ReturnType<typeof createMcpBridge>;
    const send = vi.fn((_sender: unknown, payload: unknown) => {
      const req = payload as { requestId: string };
      void bridge.requestApproval({
        requestId: req.requestId,
        resolution: { action: "ask", reason: { kind: "tool-policy" } },
      }).then((decision) => {
        bridge.resolveResult({
          requestId: req.requestId,
          ok: false,
          error: {
            code: "approval-denied",
            message: decision.message ?? "user declined",
          },
        });
      });
    });
    bridge = createMcpBridge({
      senders: () => [{ isDestroyed: () => false } as never],
      send,
      approvalGate: async () => ({ allow: false, message: "user declined" }),
    });
    bridge.setSurface(SURFACE);
    await expect(
      bridge.provider.callTool({ identity: RUN, rig: RIG, toolName: "terminal_run", input: { command: "ls" } }),
    ).rejects.toThrow("user declined");
    expect(send).toHaveBeenCalledOnce();
  });

  it("passes the shared mandatory policy into the identity approval gate", async () => {
    const gate = vi.fn(async () => ({ allow: true }));
    let bridge: ReturnType<typeof createMcpBridge>;
    bridge = createMcpBridge({
      senders: () => [{ isDestroyed: () => false } as never],
      send: (_s, payload) => {
        const req = payload as { requestId: string };
        void bridge.requestApproval({
          requestId: req.requestId,
          resolution: { action: "ask", reason: { kind: "mandatory" } },
        }).then(() => bridge.resolveResult({ requestId: req.requestId, ok: true, result: 1 }));
      },
      approvalGate: gate,
    });
    bridge.setSurface(SURFACE);
    await bridge.provider.callTool({ identity: RUN, rig: RIG, toolName: "terminal_run", input: { command: "ls" } });
    expect(gate).toHaveBeenCalledWith(expect.objectContaining({
      needsApproval: true,
      mandatory: true,
      toolName: "terminal_run",
    }));
  });
});
// Owned by the mcp-server-native provider plugin.
