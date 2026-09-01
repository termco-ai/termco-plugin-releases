import { beforeEach, describe, expect, it, vi } from "vitest";
import { cdpUsable, detachCdp, ensureCdp } from "./cdp";
import type { WebContents } from "electron";

/** Minimal fake of the bits of webContents/debugger cdp.ts touches. */
function fakeWc(opts: { attachThrows?: boolean } = {}) {
  const listeners = new Map<string, (...a: unknown[]) => void>();
  let attached = false;
  const commands: string[] = [];
  const wc = {
    isDestroyed: () => false,
    once: vi.fn(),
    debugger: {
      isAttached: () => attached,
      attach: vi.fn(() => {
        if (opts.attachThrows) throw new Error("Another debugger is attached");
        attached = true;
      }),
      detach: vi.fn(() => {
        attached = false;
      }),
      sendCommand: vi.fn((method: string) => {
        commands.push(method);
        return Promise.resolve({});
      }),
      on: vi.fn((event: string, cb: (...a: unknown[]) => void) => {
        listeners.set(event, cb);
      }),
    },
  };
  return { wc: wc as unknown as WebContents, commands, listeners, raw: wc };
}

beforeEach(() => vi.clearAllMocks());

describe("ensureCdp", () => {
  it("attaches and enables the required domains", async () => {
    const { wc, commands, raw } = fakeWc();
    expect(await ensureCdp(wc)).toBe(true);
    expect(raw.debugger.attach).toHaveBeenCalledWith("1.3");
    expect(commands).toEqual(
      expect.arrayContaining([
        "DOM.enable",
        "Accessibility.enable",
        "Runtime.enable",
        "Page.enable",
      ]),
    );
    expect(cdpUsable(wc)).toBe(true);
  });

  it("is idempotent — a second call does not re-attach", async () => {
    const { wc, raw } = fakeWc();
    await ensureCdp(wc);
    await ensureCdp(wc);
    expect(raw.debugger.attach).toHaveBeenCalledTimes(1);
  });

  it("returns false and stays unusable when attach throws (DevTools open)", async () => {
    const { wc } = fakeWc({ attachThrows: true });
    expect(await ensureCdp(wc)).toBe(false);
    expect(cdpUsable(wc)).toBe(false);
  });

  it("re-attaches after a detach event drops the session", async () => {
    const { wc, listeners, raw } = fakeWc();
    await ensureCdp(wc);
    // Simulate the user opening DevTools → CDP detaches.
    raw.debugger.detach();
    listeners.get("detach")?.();
    expect(cdpUsable(wc)).toBe(false);
    // Next command re-attaches.
    expect(await ensureCdp(wc)).toBe(true);
    expect(raw.debugger.attach).toHaveBeenCalledTimes(2);
  });

  it("detachCdp detaches and marks unusable", async () => {
    const { wc, raw } = fakeWc();
    await ensureCdp(wc);
    detachCdp(wc);
    expect(raw.debugger.detach).toHaveBeenCalled();
    expect(cdpUsable(wc)).toBe(false);
  });
});
