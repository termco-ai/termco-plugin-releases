// Kept with the source-owning terminal plugin.
import { describe, expect, it, vi } from "vitest";
import { computeRange } from "../../block/lib/blockRange";
import { TerminalLineSpace } from "./index";

describe("TerminalLineSpace coordinates", () => {
  it("starts as an identity mapping", () => {
    const space = new TerminalLineSpace();
    expect(space.trimOffset).toBe(0);
    expect(space.toAbsolute(7)).toBe(7);
    expect(space.toBuffer(7)).toBe(7);
  });

  it("round-trips toAbsolute/toBuffer across trims", () => {
    const space = new TerminalLineSpace();
    space.notifyTrim(120);
    space.notifyTrim(35);
    expect(space.trimOffset).toBe(155);
    expect(space.toBuffer(space.toAbsolute(9))).toBe(9);
    expect(space.toAbsolute(space.toBuffer(200))).toBe(200);
    expect(space.toAbsolute(0)).toBe(155);
  });

  it("round-trips across a rebase", () => {
    const space = new TerminalLineSpace();
    space.notifyTrim(50);
    space.rebase(300);
    expect(space.trimOffset).toBe(300);
    expect(space.toBuffer(300)).toBe(0);
    expect(space.toBuffer(space.toAbsolute(4))).toBe(4);
  });

  it("ignores non-positive trim shifts", () => {
    const space = new TerminalLineSpace();
    space.notifyTrim(0);
    space.notifyTrim(-3);
    expect(space.trimOffset).toBe(0);
  });
});

describe("anchors", () => {
  it("tracks buffer line across trims", () => {
    const space = new TerminalLineSpace();
    const anchor = space.createAnchor(10);
    expect(anchor.line).toBe(10);
    space.notifyTrim(4);
    expect(anchor.line).toBe(6);
    expect(anchor.absoluteLine).toBe(10);
    space.notifyTrim(6);
    expect(anchor.line).toBe(0);
    expect(anchor.isDisposed).toBe(false);
  });

  it("keeps anchors() ascending by absoluteLine on out-of-order creation", () => {
    const space = new TerminalLineSpace();
    space.createAnchor(30);
    space.createAnchor(10);
    space.createAnchor(20);
    space.createAnchor(10);
    expect(space.anchors().map((a) => a.absoluteLine)).toEqual([
      10, 10, 20, 30,
    ]);
  });

  it("assigns unique ids", () => {
    const space = new TerminalLineSpace();
    const ids = [
      space.createAnchor(5).id,
      space.createAnchor(3).id,
      space.createAnchor(3).id,
    ];
    expect(new Set(ids).size).toBe(3);
  });

  it("disposes exactly the anchors below the new offset on trim", () => {
    const space = new TerminalLineSpace();
    const gone = space.createAnchor(9);
    const survivorAtTop = space.createAnchor(10);
    const survivorAbove = space.createAnchor(11);
    space.notifyTrim(10);
    expect(gone.isDisposed).toBe(true);
    expect(gone.line).toBe(-1);
    // Boundary: the anchor at the new first buffer line survives.
    expect(survivorAtTop.isDisposed).toBe(false);
    expect(survivorAtTop.line).toBe(0);
    expect(survivorAbove.line).toBe(1);
    expect(space.anchors()).toEqual([survivorAtTop, survivorAbove]);
  });

  it("fires onDispose exactly once on trim-eviction", () => {
    const space = new TerminalLineSpace();
    const anchor = space.createAnchor(2);
    const cb = vi.fn();
    anchor.onDispose(cb);
    space.notifyTrim(5);
    space.notifyTrim(5);
    anchor.dispose();
    expect(cb).toHaveBeenCalledTimes(1);
  });

  it("supports manual dispose", () => {
    const space = new TerminalLineSpace();
    const anchor = space.createAnchor(3);
    const cb = vi.fn();
    anchor.onDispose(cb);
    anchor.dispose();
    expect(anchor.isDisposed).toBe(true);
    expect(anchor.line).toBe(-1);
    expect(space.anchors()).toEqual([]);
    anchor.dispose();
    expect(cb).toHaveBeenCalledTimes(1);
  });

  it("stops notifying after unsubscribe", () => {
    const space = new TerminalLineSpace();
    const anchor = space.createAnchor(3);
    const removed = vi.fn();
    const kept = vi.fn();
    const unsubscribe = anchor.onDispose(removed);
    anchor.onDispose(kept);
    unsubscribe();
    anchor.dispose();
    expect(removed).not.toHaveBeenCalled();
    expect(kept).toHaveBeenCalledTimes(1);
  });
});

describe("rebase", () => {
  it("keeps anchors at/above the base and evicts the rest", () => {
    const space = new TerminalLineSpace();
    const below = space.createAnchor(99);
    const atBase = space.createAnchor(100);
    const above = space.createAnchor(140);
    const cb = vi.fn();
    below.onDispose(cb);
    space.rebase(100);
    expect(below.isDisposed).toBe(true);
    expect(cb).toHaveBeenCalledTimes(1);
    expect(atBase.line).toBe(0);
    expect(above.line).toBe(40);
    expect(space.anchors()).toEqual([atBase, above]);
  });
});

describe("notifyReset", () => {
  it("disposes all anchors", () => {
    const space = new TerminalLineSpace();
    const a = space.createAnchor(1);
    const b = space.createAnchor(5);
    const cb = vi.fn();
    a.onDispose(cb);
    b.onDispose(cb);
    space.notifyReset();
    expect(a.isDisposed).toBe(true);
    expect(b.isDisposed).toBe(true);
    expect(cb).toHaveBeenCalledTimes(2);
    expect(space.anchors()).toEqual([]);
  });

  it("keeps the absolute space monotonic after a reset", () => {
    const space = new TerminalLineSpace();
    space.notifyTrim(40);
    space.createAnchor(space.toAbsolute(12));
    space.notifyReset(60);
    expect(space.trimOffset).toBe(60);
    const fresh = space.createAnchor(space.toAbsolute(0));
    expect(fresh.absoluteLine).toBe(60);
    expect(fresh.line).toBe(0);
  });

  it("defaults to the current top and never moves backwards", () => {
    const space = new TerminalLineSpace();
    space.notifyTrim(25);
    space.notifyReset();
    expect(space.trimOffset).toBe(25);
    space.notifyReset(10);
    expect(space.trimOffset).toBe(25);
  });
});

describe("blockRange compatibility", () => {
  it("computes ranges from live anchors and tracks trims", () => {
    const space = new TerminalLineSpace();
    const start = space.createAnchor(10);
    const end = space.createAnchor(14);
    expect(computeRange(start, end)).toEqual({ start: 10, end: 14 });
    space.notifyTrim(8);
    expect(computeRange(start, end)).toEqual({ start: 2, end: 6 });
  });

  it("returns null once either anchor is evicted or disposed", () => {
    const space = new TerminalLineSpace();
    const start = space.createAnchor(10);
    const end = space.createAnchor(14);
    space.notifyTrim(12);
    expect(computeRange(start, end)).toBeNull();
    end.dispose();
    expect(computeRange(start, end)).toBeNull();
  });
});
