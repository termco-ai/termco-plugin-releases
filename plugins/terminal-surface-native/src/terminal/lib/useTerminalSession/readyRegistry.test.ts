// Kept with the source-owning terminal plugin.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  disposeReadyWaiters,
  markSessionReady,
  whenSessionReady,
} from "./readyRegistry";

let nextLeaf = 1000;
function freshLeaf(): number {
  nextLeaf += 1;
  return nextLeaf;
}

async function settled(p: Promise<void>): Promise<boolean> {
  let done = false;
  void p.then(() => {
    done = true;
  });
  for (let i = 0; i < 5; i++) await Promise.resolve();
  return done;
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("whenSessionReady", () => {
  it("resolves immediately when the leaf is already ready", async () => {
    const leaf = freshLeaf();
    markSessionReady(leaf);
    await expect(whenSessionReady(leaf)).resolves.toBeUndefined();
  });

  it("resolves when markSessionReady fires later", async () => {
    const leaf = freshLeaf();
    const p = whenSessionReady(leaf);
    expect(await settled(p)).toBe(false);
    markSessionReady(leaf);
    expect(await settled(p)).toBe(true);
  });

  it("resolves all queued waiters on ready", async () => {
    const leaf = freshLeaf();
    const a = whenSessionReady(leaf);
    const b = whenSessionReady(leaf);
    markSessionReady(leaf);
    expect(await settled(a)).toBe(true);
    expect(await settled(b)).toBe(true);
  });

  it("resolves after the timeout when no ready signal arrives", async () => {
    const leaf = freshLeaf();
    const p = whenSessionReady(leaf, 500);
    vi.advanceTimersByTime(499);
    expect(await settled(p)).toBe(false);
    vi.advanceTimersByTime(1);
    expect(await settled(p)).toBe(true);
  });

  it("removes only the timed-out waiter, keeping later ones alive", async () => {
    const leaf = freshLeaf();
    const short = whenSessionReady(leaf, 100);
    const long = whenSessionReady(leaf, 5000);
    vi.advanceTimersByTime(100);
    expect(await settled(short)).toBe(true);
    expect(await settled(long)).toBe(false);
    markSessionReady(leaf);
    expect(await settled(long)).toBe(true);
  });

  it("is idempotent: repeated markSessionReady does not throw", () => {
    const leaf = freshLeaf();
    markSessionReady(leaf);
    expect(() => markSessionReady(leaf)).not.toThrow();
  });
});

describe("disposeReadyWaiters", () => {
  it("resolves pending waiters on disposal", async () => {
    const leaf = freshLeaf();
    const p = whenSessionReady(leaf);
    disposeReadyWaiters(leaf);
    expect(await settled(p)).toBe(true);
  });

  it("drops the ready flag so a respawned leaf waits again", async () => {
    const leaf = freshLeaf();
    markSessionReady(leaf);
    disposeReadyWaiters(leaf);
    const p = whenSessionReady(leaf);
    expect(await settled(p)).toBe(false);
    markSessionReady(leaf);
    expect(await settled(p)).toBe(true);
  });

  it("is a no-op for leaves with no waiters", () => {
    expect(() => disposeReadyWaiters(freshLeaf())).not.toThrow();
  });
});
