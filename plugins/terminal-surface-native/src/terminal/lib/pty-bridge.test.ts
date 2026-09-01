import type { WorkspaceEnv } from "../../runtime";
import { configureTerminalRuntime, type TerminalRuntime } from "../../runtime";
import type { PtyOpenHandlers, PtyOpenParams } from "@termco/terminal-base";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { openPty, type PtyHandlers } from "./pty-bridge";

const workspace: WorkspaceEnv = {
  kind: "ssh",
  connectionId: "other-server",
  host: "other-server",
};
const pty = {
  open: vi.fn<
    (params: PtyOpenParams, handlers: PtyOpenHandlers) => Promise<number>
  >(async () => 7),
  write: vi.fn<(id: number, bytes: Uint8Array) => void>(),
  resize: vi.fn<(id: number, cols: number, rows: number) => void>(),
  close: vi.fn<(id: number) => void>(),
};
let disposeRuntime: (() => void) | null = null;

function openHandlers() {
  const handlers = pty.open.mock.calls.at(-1)?.[1];
  if (!handlers) throw new Error("PTY was not opened");
  return handlers;
}

beforeEach(() => {
  vi.clearAllMocks();
  pty.open.mockResolvedValue(7);
  disposeRuntime = configureTerminalRuntime({ pty } as unknown as TerminalRuntime);
});

afterEach(() => {
  disposeRuntime?.();
  disposeRuntime = null;
});

describe("openPty", () => {
  it("passes dims, cwd, blocks and shell through to pty_open", async () => {
    await openPty(
      120,
      40,
      { onData: vi.fn() },
      workspace,
      "/work",
      true,
      "/bin/fish",
    );
    expect(pty.open).toHaveBeenCalledWith(
      {
        cols: 120,
        rows: 40,
        cwd: "/work",
        workspace,
        blocks: true,
        shell: "/bin/fish",
      },
      expect.any(Object),
    );
  });

  it("defaults cwd, blocks and shell when omitted", async () => {
    await openPty(80, 24, { onData: vi.fn() }, workspace);
    expect(pty.open.mock.calls[0][0]).toMatchObject({
      cwd: null,
      blocks: false,
      shell: null,
    });
  });

  it("returns the backend session id", async () => {
    pty.open.mockResolvedValue(42);
    const session = await openPty(80, 24, { onData: vi.fn() }, workspace);
    expect(session.id).toBe(42);
  });

  it("delivers output bytes to onData as Uint8Array", async () => {
    const onData = vi.fn();
    await openPty(80, 24, { onData }, workspace);
    openHandlers().onData(new Uint8Array([104, 105]).buffer);
    expect(onData).toHaveBeenCalledTimes(1);
    expect(onData.mock.calls[0][0]).toBeInstanceOf(Uint8Array);
    expect([...onData.mock.calls[0][0]]).toEqual([104, 105]);
  });

  it("delivers the exit code and then releases handlers", async () => {
    const onData = vi.fn();
    const onExit = vi.fn();
    await openPty(80, 24, { onData, onExit }, workspace);
    const handlers = openHandlers();
    handlers.onExit(3);
    expect(onExit).toHaveBeenCalledWith(3);
    handlers.onData(new Uint8Array([1]).buffer);
    handlers.onExit(9);
    expect(onData).not.toHaveBeenCalled();
    expect(onExit).toHaveBeenCalledTimes(1);
  });

  it("tolerates a missing onExit handler", async () => {
    const handlers: PtyHandlers = { onData: vi.fn() };
    await openPty(80, 24, handlers, workspace);
    expect(() => openHandlers().onExit(0)).not.toThrow();
  });

  it("writes UTF-8 encoded bytes with the pty id", async () => {
    pty.open.mockResolvedValue(9);
    const session = await openPty(80, 24, { onData: vi.fn() }, workspace);
    await session.write("hé");
    expect(pty.write).toHaveBeenCalledWith(9, new TextEncoder().encode("hé"));
  });

  it("resizes through pty_resize with the session id", async () => {
    pty.open.mockResolvedValue(5);
    const session = await openPty(80, 24, { onData: vi.fn() }, workspace);
    await session.resize(100, 30);
    expect(pty.resize).toHaveBeenCalledWith(5, 100, 30);
  });

  it("closes once and releases handlers even on repeat close", async () => {
    const onData = vi.fn();
    const session = await openPty(80, 24, { onData }, workspace);
    const handlers = openHandlers();
    await session.close();
    await session.close();
    expect(pty.close).toHaveBeenCalledTimes(1);
    expect(pty.close).toHaveBeenCalledWith(7);
    handlers.onData(new Uint8Array([1]).buffer);
    expect(onData).not.toHaveBeenCalled();
  });

  it("releases handlers even when pty_close rejects", async () => {
    const onData = vi.fn();
    const session = await openPty(80, 24, { onData }, workspace);
    const handlers = openHandlers();
    pty.close.mockImplementationOnce(() => {
      throw new Error("gone");
    });
    await expect(session.close()).rejects.toThrow("gone");
    handlers.onData(new Uint8Array([1]).buffer);
    expect(onData).not.toHaveBeenCalled();
  });

  it("opens the PTY against the terminal tab's explicit rig workspace", async () => {
    await openPty(120, 40, { onData: vi.fn() }, workspace, "/srv/project");
    expect(pty.open).toHaveBeenCalledWith(
      expect.objectContaining({
        cols: 120,
        rows: 40,
        cwd: "/srv/project",
        workspace,
      }),
      expect.any(Object),
    );
  });
});
