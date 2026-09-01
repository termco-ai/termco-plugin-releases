import type { ProcessTransport } from "@termco/kernel";
import { describe, expect, it, vi } from "vitest";
import { createRendererPtyCapability } from "./renderer";

function bridge(call: ProcessTransport["call"]) {
  const listeners = new Map<number, (...messages: unknown[]) => void>();
  let nextChannel = 0;
  const releaseChannel = vi.fn((channel: { __termcoChannel: number }) => {
    listeners.delete(channel.__termcoChannel);
  });
  const transport: ProcessTransport = {
    call,
    registerChannel<TMessages extends unknown[]>(
      listener: (...messages: TMessages) => void,
    ) {
      const channel = { __termcoChannel: ++nextChannel };
      listeners.set(
        channel.__termcoChannel,
        listener as (...messages: unknown[]) => void,
      );
      return channel;
    },
    releaseChannel,
    releaseRemote: vi.fn(async () => undefined),
  };
  return { pty: createRendererPtyCapability(transport), listeners, releaseChannel };
}

describe("PTY renderer bridge", () => {
  it("streams onData and onExit then performs idempotent close cleanup", async () => {
    const call = vi.fn(async (_service, method) => method === "open" ? 41 : undefined);
    const { pty, listeners, releaseChannel } = bridge(call);
    const onData = vi.fn();
    const onExit = vi.fn();

    const id = await pty.open({ cols: 80, rows: 24 }, { onData, onExit });
    listeners.get(1)?.(Uint8Array.of(1, 2));
    listeners.get(2)?.(0);
    pty.close(id);

    expect(onData).toHaveBeenCalledWith(Uint8Array.of(1, 2));
    expect(onExit).toHaveBeenCalledWith(0);
    expect(releaseChannel).toHaveBeenCalledTimes(2);
  });

  it("releases both callback channels when open rejects", async () => {
    const error = new Error("pty open failed");
    const { pty, releaseChannel } = bridge(vi.fn(async () => { throw error; }));

    await expect(
      pty.open({ cols: 80, rows: 24 }, { onData: vi.fn(), onExit: vi.fn() }),
    ).rejects.toBe(error);
    expect(releaseChannel).toHaveBeenCalledTimes(2);
  });

  it("cleans channels when the process exits before open resolves", async () => {
    let listeners = new Map<number, (...messages: unknown[]) => void>();
    const call = vi.fn(async (_service, method) => {
      if (method === "open") listeners.get(2)?.(0);
      return 9;
    });
    const bridgeResult = bridge(call);
    listeners = bridgeResult.listeners;

    await expect(
      bridgeResult.pty.open(
        { cols: 80, rows: 24 },
        { onData: vi.fn(), onExit: vi.fn() },
      ),
    ).resolves.toBe(9);
    expect(bridgeResult.releaseChannel).toHaveBeenCalledTimes(2);
  });

  it("dispose closes every live session and releases its channels", async () => {
    let id = 0;
    const call = vi.fn(async (_service, method) => method === "open" ? ++id : undefined);
    const { pty, releaseChannel } = bridge(call);
    await pty.open({ cols: 80, rows: 24 }, { onData: vi.fn(), onExit: vi.fn() });
    await pty.open({ cols: 80, rows: 24 }, { onData: vi.fn(), onExit: vi.fn() });

    pty.dispose();
    pty.dispose();

    expect(releaseChannel).toHaveBeenCalledTimes(4);
    expect(call.mock.calls.filter((entry) => entry[1] === "close")).toHaveLength(2);
  });
});
