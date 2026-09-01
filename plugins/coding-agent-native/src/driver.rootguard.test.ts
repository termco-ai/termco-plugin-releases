/**
 * Runtime root-guard retry for an SSH rig
 * on a root account, invisible to static checks when the ssh-config alias
 * hides the user). The driver must detect the refusal and respawn the SAME
 * turn once with acceptEdits — not kill the run.
 */
import { describe, expect, it, vi } from "vitest";
import type { AgentEvent, AgentRunStartParams } from "@termco/agents-base";
import { type ChildLike, createCodingAgentDriver, type SpawnFn } from "./driver";

function makeFakeChild() {
  const handlers: {
    data?: (c: unknown) => void;
    err?: (c: unknown) => void;
    close?: (c: number | null) => void;
  } = {};
  const child: ChildLike & {
    emitStderr: (s: string) => void;
    emitData: (s: string) => void;
    emitClose: (code: number) => void;
  } = {
    stdout: { on: (_e, cb) => { handlers.data = cb; } },
    stderr: { on: (_e, cb) => { handlers.err = cb; } },
    on(event, cb) {
      if (event === "close") handlers.close = cb as (c: number | null) => void;
    },
    kill: () => {},
    emitStderr: (s) => handlers.err?.(s),
    emitData: (s) => handlers.data?.(s),
    emitClose: (code) => handlers.close?.(code),
  };
  return child;
}

const REFUSAL =
  "--dangerously-skip-permissions cannot be used with root/sudo privileges for security reasons";

const PARAMS: AgentRunStartParams = {
  runId: "r1",
  backend: "claude",
  prompt: "open the browser",
  cwd: "/root",
  permissionMode: "bypass",
  workspace: { kind: "ssh", connectionId: "opendoc-v2", host: "opendoc-v2" },
};

describe("root-guard retry", () => {
  it("respawns the turn once with acceptEdits and a non-fatal notice", () => {
    const children: ReturnType<typeof makeFakeChild>[] = [];
    const spawnArgs: string[][] = [];
    const spawn: SpawnFn = vi.fn((_bin, args) => {
      spawnArgs.push(args);
      const c = makeFakeChild();
      children.push(c);
      return c;
    });
    const driver = createCodingAgentDriver({ spawn, env: {} });
    const events: AgentEvent[] = [];
    driver.startRun(PARAMS, (e) => events.push(e));

    // First spawn: full-auto is refused as root and exits.
    expect(spawnArgs[0]).toContain("bypassPermissions");
    children[0].emitStderr(REFUSAL);
    children[0].emitClose(1);

    // The run is NOT dead: a second spawn happened, now with acceptEdits.
    expect(children).toHaveLength(2);
    expect(spawnArgs[1]).toContain("acceptEdits");
    expect(spawnArgs[1]).not.toContain("bypassPermissions");
    // The user learned why, non-fatally.
    const notice = events.find((e) => e.type === "error");
    expect(notice).toMatchObject({ type: "error", fatal: false });
    expect(driver.activeRunIds()).toEqual(["r1"]);

    // The retried turn proceeds normally.
    children[1].emitData(
      `${JSON.stringify({ type: "system", subtype: "init", session_id: "s1" })}\n`,
    );
    children[1].emitData(`${JSON.stringify({ type: "result", subtype: "success" })}\n`);
    children[1].emitClose(0);
    expect(events.some((e) => e.type === "turn-end")).toBe(true);
  });

  it("retries only ONCE — a second refusal is a real fatal error", () => {
    const children: ReturnType<typeof makeFakeChild>[] = [];
    const spawn: SpawnFn = vi.fn(() => {
      const c = makeFakeChild();
      children.push(c);
      return c;
    });
    const driver = createCodingAgentDriver({ spawn, env: {} });
    const events: AgentEvent[] = [];
    driver.startRun(PARAMS, (e) => events.push(e));
    children[0].emitStderr(REFUSAL);
    children[0].emitClose(1);
    // Second child also refuses (shouldn't happen, but must not loop forever).
    children[1].emitStderr(REFUSAL);
    children[1].emitClose(1);
    expect(children).toHaveLength(2); // no third spawn
    expect(events.some((e) => e.type === "error" && e.fatal === true)).toBe(true);
    expect(events.at(-1)?.type).toBe("exit");
  });

  it("does not fire for a non-bypass run (unrelated stderr keeps failing fatally)", () => {
    const children: ReturnType<typeof makeFakeChild>[] = [];
    const spawn: SpawnFn = vi.fn(() => {
      const c = makeFakeChild();
      children.push(c);
      return c;
    });
    const driver = createCodingAgentDriver({ spawn, env: {} });
    const events: AgentEvent[] = [];
    driver.startRun({ ...PARAMS, permissionMode: "default" }, (e) => events.push(e));
    children[0].emitStderr(REFUSAL); // nonsensical for default, but must not retry
    children[0].emitClose(1);
    expect(children).toHaveLength(1);
    expect(events.some((e) => e.type === "error" && e.fatal === true)).toBe(true);
  });
});
// Owned by the coding-agent-native provider plugin.
