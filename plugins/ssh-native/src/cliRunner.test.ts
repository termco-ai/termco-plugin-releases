// @vitest-environment node
import { EventEmitter } from "node:events";
import { afterEach, expect, it, vi } from "vitest";
const spawn = vi.hoisted(() => vi.fn());
vi.mock("node:child_process", () => ({ spawn }));
import { runCli } from "./cliRunner";
afterEach(() => vi.useRealTimers());
it("pauses the command timeout while the user is entering an SSH password", async () => {
  vi.useFakeTimers();
  const child = Object.assign(new EventEmitter(), {
    stdout: new EventEmitter(),
    stderr: new EventEmitter(),
    kill: vi.fn(),
  });
  spawn.mockReturnValue(child);
  let waiting = true;
  const result = runCli("ssh", ["host"], 1, { waiting: () => waiting });
  await vi.advanceTimersByTimeAsync(30_000);
  expect(child.kill).not.toHaveBeenCalled();
  waiting = false;
  await vi.advanceTimersByTimeAsync(1_000);
  expect(child.kill).toHaveBeenCalledWith("SIGKILL");
  expect((await result).timedOut).toBe(true);
});
