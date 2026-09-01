import { describe, expect, it, vi } from "vitest";
import { startMcpToolBridge } from "./bridge";

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

describe("MCP tool bridge lifecycle", () => {
  it("routes a tool request through the family-owned receiver channel", async () => {
    let receive: ((message: unknown) => void) | undefined;
    const unregister = vi.fn();
    const invoke = vi.fn(async () => ({ ok: true }));
    const execute = vi.fn(async () => ({
      requestId: "r-channel",
      ok: true,
      result: { tabs: [] },
    }));
    const stop = startMcpToolBridge({
      server: { invoke },
      createReceiver(listener: (message: unknown) => void) {
        receive = listener;
        return { marker: "receiver-channel", dispose: unregister };
      },
      tools: {
        surface: async () => [{ name: "list_tabs" }],
        execute,
        subscribe: () => () => {},
      },
      addApproval: vi.fn(async () => {}),
      addInteraction: vi.fn(async () => {}),
    } as never);
    await flush();

    receive?.({
      event: "mcp:tool-request",
      payload: { requestId: "r-channel", toolName: "list_tabs" },
    });
    await flush();

    expect(execute).toHaveBeenCalledWith({
      requestId: "r-channel",
      toolName: "list_tabs",
    });
    expect(invoke).toHaveBeenCalledWith("mcp_tool_result", {
      requestId: "r-channel",
      ok: true,
      result: { tabs: [] },
    });
    stop();
    await flush();
    expect(unregister).toHaveBeenCalledOnce();
  });

  it("republishes the surface when tools register after bridge activation", async () => {
    const invoke = vi.fn(async (_method: string, _payload: unknown) => ({
      ok: true,
    }));
    let contributions = [{ name: "get_context" }];
    let publish: (() => void) | undefined;
    const unsubscribeTools = vi.fn();
    const stop = startMcpToolBridge({
      server: { invoke },
      createReceiver: () => ({ marker: "receiver-channel", dispose: vi.fn() }),
      tools: {
        surface: async () => contributions,
        execute: vi.fn(async () => ({})),
        subscribe(listener: () => void) {
          publish = listener;
          return unsubscribeTools;
        },
      },
      addApproval: vi.fn(async () => {}),
      addInteraction: vi.fn(async () => {}),
    });
    await flush();

    contributions = [{ name: "get_context" }, { name: "list_tabs" }];
    publish?.();
    await flush();
    contributions = [{ name: "get_context" }];
    publish?.();
    await flush();

    expect(
      invoke.mock.calls.filter(([method]) => method === "mcp_surface_register"),
    ).toEqual([
      ["mcp_surface_register", { tools: [{ name: "get_context" }] }],
      [
        "mcp_surface_register",
        { tools: [{ name: "get_context" }, { name: "list_tabs" }] },
      ],
      ["mcp_surface_register", { tools: [{ name: "get_context" }] }],
    ]);
    stop();
    expect(unsubscribeTools).toHaveBeenCalledOnce();
  });

  it("registers, routes every event, replies, and cleans up", async () => {
    let receive: ((message: unknown) => void) | undefined;
    const invoke = vi.fn(async () => ({ ok: true }));
    const execute = vi.fn(async () => ({ requestId: "r1", ok: true, result: "done" }));
    const addApproval = vi.fn(async () => {});
    const addInteraction = vi.fn(async () => {});
    const releaseReceiver = vi.fn();
    const stop = startMcpToolBridge({
      server: { invoke },
      createReceiver(listener) {
        receive = listener;
        return { marker: "receiver-channel", dispose: releaseReceiver };
      },
      tools: {
        surface: async () => [{ name: "list_tabs" }],
        execute,
        subscribe: () => () => {},
      },
      addApproval,
      addInteraction,
    });
    await flush();
    expect(invoke).toHaveBeenCalledWith("mcp_bridge_register", {
      receiver: "receiver-channel",
    });
    expect(invoke).toHaveBeenCalledWith("mcp_surface_register", {
      tools: [{ name: "list_tabs" }],
    });

    receive?.({ event: "mcp:tool-request", payload: { requestId: "r1" } });
    receive?.({ event: "mcp:approval-request", payload: { requestId: "a1" } });
    receive?.({ event: "mcp:run-interaction", payload: { requestId: "i1" } });
    await flush();
    expect(execute).toHaveBeenCalledWith({ requestId: "r1" });
    expect(addApproval).toHaveBeenCalledWith({ requestId: "a1" });
    expect(addInteraction).toHaveBeenCalledWith({ requestId: "i1" });
    expect(invoke).toHaveBeenCalledWith("mcp_tool_result", {
      requestId: "r1",
      ok: true,
      result: "done",
    });

    stop();
    await flush();
    expect(releaseReceiver).toHaveBeenCalledOnce();
    expect(invoke).toHaveBeenCalledWith("mcp_surface_register", { tools: [] });
    expect(invoke).toHaveBeenCalledWith("mcp_bridge_unregister", {});
  });
});
