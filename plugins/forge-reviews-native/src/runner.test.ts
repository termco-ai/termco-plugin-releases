// @vitest-environment node
import { EventEmitter } from "node:events";
import { afterEach, expect, it, vi } from "vitest";
import { spawn } from "node:child_process";
vi.mock("node:child_process", async (original) => ({
  ...await original<typeof import("node:child_process")>(),
  spawn: vi.fn(),
  execFile: (_file: string, _args: string[], _options: unknown, callback: Function) => {
    queueMicrotask(() => callback(null, "/virtual"));
    return new EventEmitter();
  },
}));
afterEach(() => vi.clearAllMocks());
vi.mock("./executableDiscovery", () => ({
  resolveForgeExecutable: async () => "/virtual/gh",
  forgeExecutableEnvironment: (env: unknown) => env,
  clearForgeExecutableCache: vi.fn(),
}));
import { createForgeCommandRunner } from "./runner";

it("handles a broken input pipe as a command failure without an unhandled stream error", async () => {
  const child = Object.assign(new EventEmitter(), {
    stdin: Object.assign(new EventEmitter(), { end: vi.fn() }),
    stdout: new EventEmitter(), stderr: new EventEmitter(), kill: vi.fn(),
  });
  child.stdin.end.mockImplementation(() => {
    child.stdin.emit("error", Object.assign(new Error("write EPIPE"), { code: "EPIPE" }));
    queueMicrotask(() => child.emit("close", 0));
  });
  vi.mocked(spawn).mockReturnValue(child as never);
  const result = await createForgeCommandRunner({} as never).run({ executable: "gh", args: ["api"], stdin: "payload" }, { kind: "local" });
  expect(result.notFound).toBe(false);
  expect(result.exitCode).not.toBe(0);
  expect(result.stderr).toContain("EPIPE");
});
