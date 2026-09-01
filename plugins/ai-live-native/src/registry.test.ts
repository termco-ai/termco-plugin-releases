import { describe, expect, it, vi } from "vitest";
import { AiLiveRegistry } from "./registry";

describe("AiLiveRegistry", () => {
  it("exposes contributions through the ordinary registry interface", () => {
    const registry = new AiLiveRegistry();
    const contribution = { getCwd: () => "/workspace" };
    const dispose = registry.register(contribution);

    expect(registry.snapshot()).toEqual([contribution]);
    dispose();
    expect(registry.snapshot()).toEqual([]);
  });

  it("exposes one stable facade with non-crashing fallbacks", async () => {
    const registry = new AiLiveRegistry();
    const live = registry.live();

    expect(registry.live()).toBe(live);
    expect(live.getCwd()).toBeNull();
    expect(live.getTerminalContext()).toBeNull();
    expect(live.isActiveTerminalPrivate()).toBe(false);
    expect(live.injectIntoActivePty("x")).toBe(false);
    await expect(live.runInActiveTerminal("ls")).resolves.toEqual({
      error: "no terminal",
    });
    expect(live.listTabs()).toEqual([]);
    expect(live.listBrowserTabs()).toEqual([]);
    expect(live.focusView({ id: 1 })).toEqual({ ok: false });
    expect(live.openBrowser("https://example.com")).toBe(-1);
    expect(live.spawnManagedAgent("prompt", "session")).toBeNull();
    expect(live.getManagedAgent?.("session")).toBeNull();
    await expect(live.sendManagedAgentInstruction?.("session", "continue"))
      .resolves.toMatchObject({ ok: false });
    expect(live.readManagedAgentOutput?.("session")).toBeNull();
    expect(live.readLeafBuffer(1)).toBeNull();
  });

  it("routes each method to the newest contribution and restores on dispose", () => {
    const registry = new AiLiveRegistry();
    const live = registry.live();
    const first = registry.contribute({
      getCwd: () => "/first",
      getWorkspaceRoot: () => "/root",
    });
    const second = registry.contribute({ getCwd: () => "/second" });

    expect(live.getCwd()).toBe("/second");
    expect(live.getWorkspaceRoot()).toBe("/root");
    second();
    second();
    expect(live.getCwd()).toBe("/first");
    first();
    expect(live.getCwd()).toBeNull();
  });

  it("forwards arguments through the facade", () => {
    const registry = new AiLiveRegistry();
    const focusView = vi.fn(() => ({ ok: true }));
    registry.contribute({ focusView });

    registry.live().focusView({ kind: "terminal" }, "rig-1");
    expect(focusView).toHaveBeenCalledWith({ kind: "terminal" }, "rig-1");
  });
});
