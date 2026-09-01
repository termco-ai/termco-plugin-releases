import { describe, expect, it, vi } from "vitest";
import type { AgentRunStartParams } from "@termco/agents-base";
import { type ChildLike, createCodingAgentDriver, type SpawnFn } from "./driver";

function fakeChild() {
  const h: { close?: (c: number | null) => void; data?: (c: unknown) => void } = {};
  const c: ChildLike & { close: (n: number) => void; data: (s: string) => void } = {
    stdout: { on: (_e, cb) => { h.data = cb; } },
    stderr: { on: () => {} },
    on(e, cb) { if (e === "close") h.close = cb as (c: number | null) => void; },
    kill: () => {},
    data: (s) => h.data?.(s),
    close: (n) => h.close?.(n),
  };
  return c;
}

const PARAMS: AgentRunStartParams = {
  runId: "r1",
  backend: "claude",
  prompt: "go",
  cwd: "/repo",
  permissionMode: "bypass",
};

describe("driver.permissionModeOf reflects mid-session changes", () => {
  it("returns the CURRENT mode after a sendInput override (drives live MCP auto-approve)", () => {
    const children: ReturnType<typeof fakeChild>[] = [];
    const spawn: SpawnFn = vi.fn(() => { const c = fakeChild(); children.push(c); return c; });
    const driver = createCodingAgentDriver({ spawn, env: {} });
    driver.startRun(PARAMS, () => {});
    expect(driver.permissionModeOf("r1")).toBe("bypass");

    // Finish the first turn (result → turn-end, then close) so the run is idle
    // and the child is cleared.
    children[0].data(`${JSON.stringify({ type: "result", subtype: "success" })}\n`);
    children[0].close(0);
    // Switch autonomy to "ask" (default) on the next turn.
    expect(driver.sendInput("r1", "next", { permissionMode: "default" })).toBe(true);
    expect(driver.permissionModeOf("r1")).toBe("default");

    // Unknown run → undefined.
    expect(driver.permissionModeOf("nope")).toBeUndefined();
  });
});
// Owned by the coding-agent-native provider plugin.
