import { describe, expect, it, vi } from "vitest";
import { createExecutorSenderRegistry } from "./executorSenders";

describe("MCP executor sender registry", () => {
  it("dispatches only through the latest family receiver for a live sender", () => {
    const sender = {
      isDestroyed: () => false,
      once: vi.fn(),
    };
    const first = vi.fn();
    const latest = vi.fn();
    const registry = createExecutorSenderRegistry<typeof sender>();

    registry.push(sender, first);
    registry.push(sender, latest);

    expect(registry.dispatch(sender, { event: "mcp:tool-request" })).toBe(
      true,
    );
    expect(first).not.toHaveBeenCalled();
    expect(latest).toHaveBeenCalledExactlyOnceWith({
      event: "mcp:tool-request",
    });
  });

  it("wires production MCP tool requests into the family receiver envelope", () => {
    const sender = {
      isDestroyed: () => false,
      once: vi.fn(),
      send: vi.fn(),
    };
    const receiver = vi.fn();
    const registry = createExecutorSenderRegistry<typeof sender>();
    registry.push(sender, receiver);

    const sendToolRequest = registry.route("mcp:tool-request");
    sendToolRequest(sender, {
      requestId: "mcpreq-1",
      toolName: "list_tabs",
    });

    expect(receiver).toHaveBeenCalledExactlyOnceWith({
      event: "mcp:tool-request",
      payload: { requestId: "mcpreq-1", toolName: "list_tabs" },
    });
    expect(sender.send).not.toHaveBeenCalled();
  });

  it("binds one destruction listener across repeated hot registrations", () => {
    let destroyed = false;
    let onDestroyed: (() => void) | undefined;
    const sender = {
      isDestroyed: () => destroyed,
      once: vi.fn((_event: "destroyed", listener: () => void) => {
        onDestroyed = listener;
      }),
    };
    const registry = createExecutorSenderRegistry<typeof sender>();

    for (let generation = 0; generation < 20; generation += 1) {
      registry.push(sender);
    }

    expect(sender.once).toHaveBeenCalledOnce();
    expect(registry.live()).toEqual([sender]);
    destroyed = true;
    onDestroyed?.();
    expect(registry.live()).toEqual([]);
  });
});
