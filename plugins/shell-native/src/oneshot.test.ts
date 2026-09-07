/**
 * Integration tests for one-shot / background execution.
 */
import { describe, expect, it } from "vitest";
import { runCommand } from "./oneshot";
import { bgLogs, bgSpawn } from "./background";
import "./testRuntime";

const LOCAL = { kind: "local" as const };

describe("shell (integration)", () => {
  it("runs a command and captures stdout + exit code", async () => {
    const out = await runCommand("echo hello", undefined, undefined, LOCAL);
    expect(out.stdout.trim()).toBe("hello");
    expect(out.exit_code).toBe(0);
    expect(out.timed_out).toBe(false);
  });

  it("reports non-zero exit codes", async () => {
    const out = await runCommand("exit 3", undefined, undefined, LOCAL);
    expect(out.exit_code).toBe(3);
  });

  it("rejects an empty command", async () => {
    await expect(runCommand("   ", undefined, undefined, LOCAL)).rejects.toThrow();
  });

  it("times out a long-running command", async () => {
    const out = await runCommand("sleep 5", undefined, 1, LOCAL);
    expect(out.timed_out).toBe(true);
  });

  it("background process buffers output that logs return by offset", async () => {
    const handle = bgSpawn("printf 'a\\nb\\nc\\n'", undefined, LOCAL);
    await new Promise((r) => setTimeout(r, 400));
    const logs = bgLogs(handle, 0);
    expect(logs.bytes).toContain("a");
    expect(logs.bytes).toContain("c");
    expect(logs.next_offset).toBeGreaterThan(0);
  });
});

it("cancels an in-flight shell command before its child can write later", async () => {
  const { mkdtemp, readFile, rm } = await import("node:fs/promises");
  const { tmpdir } = await import("node:os");
  const { join } = await import("node:path");
  const dir = await mkdtemp(join(tmpdir(), "termco-shell-cancel-"));
  try {
    const controller = new AbortController();
    const running = runCommand("sleep 0.2; printf late > mutation.txt", dir, 5, LOCAL, controller.signal);
    controller.abort(new Error("cancelled"));
    const result = await running;
    expect(result.exit_code).not.toBe(0);
    await new Promise((resolve) => setTimeout(resolve, 300));
    await expect(readFile(join(dir, "mutation.txt"), "utf8")).rejects.toMatchObject({ code: "ENOENT" });
  } finally { await rm(dir, { recursive: true, force: true }); }
});
