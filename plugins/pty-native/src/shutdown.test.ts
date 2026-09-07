import { afterEach, describe, expect, it, vi } from "vitest";

let emitExit: ((event: { exitCode: number }) => void) | undefined;
const kill = vi.fn();

vi.mock("node-pty", () => ({
  spawn: vi.fn(() => ({
    pid: 4242,
    write: vi.fn(),
    resize: vi.fn(),
    kill,
    onData: vi.fn(),
    onExit: vi.fn((listener: (event: { exitCode: number }) => void) => {
      emitExit = listener;
      return { dispose: vi.fn() };
    }),
  })),
}));

import {
  closeAll,
  closeAllAndWait,
  close,
  configurePtySessions,
  open,
} from "./session";

afterEach(() => {
  closeAll();
  configurePtySessions(null);
  emitExit = undefined;
  kill.mockClear();
});

describe("PTY shutdown", () => {
  it("waits for a manually closed PTY's pending native exit callback", async () => {
    const events = { emit: vi.fn() };
    configurePtySessions({
      workspace: { authorizeRoot: vi.fn() } as never,
      events: events as never,
    });
    const onExit = vi.fn();
    const id = open({ cols: 80, rows: 24, shell: "/bin/sh" }, vi.fn(), onExit);

    close(id);
    let shutdownFinished = false;
    const shutdown = closeAllAndWait().then(() => {
      shutdownFinished = true;
    });
    await new Promise((resolve) => setTimeout(resolve, 0));
    const finishedBeforeNativeExit = shutdownFinished;
    emitExit?.({ exitCode: 0 });
    await shutdown;

    configurePtySessions(null);

    expect(kill).toHaveBeenCalledOnce();
    expect(finishedBeforeNativeExit).toBe(false);
    expect(onExit).toHaveBeenCalledWith(0);
  });
});

it("escalates ignored graceful termination and waits for the forced native exit", async () => {
  vi.useFakeTimers();
  configurePtySessions({ workspace: { authorizeRoot: vi.fn() } as never, events: { emit: vi.fn() } as never });
  open({ cols: 80, rows: 24, shell: "/bin/sh" }, vi.fn(), vi.fn());
  let finished = false;
  const closing = closeAllAndWait().then(() => { finished = true; });
  try {
    await vi.advanceTimersByTimeAsync(1000);
    expect(kill).toHaveBeenCalledWith("SIGKILL");
    expect(finished).toBe(false);
  } finally {
    emitExit?.({ exitCode: 137 });
    await closing;
    vi.useRealTimers();
  }
});

it("bounds shutdown even if the native callback never arrives", async () => {
  vi.useFakeTimers();
  configurePtySessions({ workspace: { authorizeRoot: vi.fn() } as never, events: { emit: vi.fn() } as never });
  open({ cols: 80, rows: 24, shell: "/bin/sh" }, vi.fn(), vi.fn());
  let finished = false;
  const closing = closeAllAndWait().then(() => { finished = true; });
  try {
    await vi.advanceTimersByTimeAsync(3000);
    expect(finished).toBe(true);
    configurePtySessions(null);
    expect(() => emitExit?.({ exitCode: 137 })).not.toThrow();
  } finally {
    // Also lets the pre-fix implementation clean up after the failed assertion.
    configurePtySessions({ workspace: {} as never, events: { emit: vi.fn() } as never });
    emitExit?.({ exitCode: 137 });
    await closing;
    vi.useRealTimers();
  }
});
