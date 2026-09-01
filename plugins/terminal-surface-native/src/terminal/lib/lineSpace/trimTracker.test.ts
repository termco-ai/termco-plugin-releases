// Kept with the source-owning terminal plugin.
import { describe, expect, it } from "vitest";
import { TrimTracker } from "./trimTracker";

describe("TrimTracker", () => {
  it("reports no trim while scrollback grows with the writes", () => {
    const tracker = new TrimTracker();
    expect(tracker.observe({ scrollbackCount: 5, linesWrittenDelta: 5 })).toBe(
      0,
    );
    expect(tracker.observe({ scrollbackCount: 12, linesWrittenDelta: 7 })).toBe(
      0,
    );
  });

  it("reports the full push as trimmed on a saturated plateau", () => {
    const tracker = new TrimTracker(1000);
    expect(
      tracker.observe({ scrollbackCount: 1000, linesWrittenDelta: 7 }),
    ).toBe(7);
    expect(
      tracker.observe({ scrollbackCount: 1000, linesWrittenDelta: 3 }),
    ).toBe(3);
  });

  it("handles page-granular oscillation (count drops, then grows again)", () => {
    const tracker = new TrimTracker(1000);
    // ghostty evicts a whole page: 405 lines vanish while 5 arrive.
    expect(
      tracker.observe({ scrollbackCount: 600, linesWrittenDelta: 5 }),
    ).toBe(405);
    expect(
      tracker.observe({ scrollbackCount: 605, linesWrittenDelta: 5 }),
    ).toBe(0);
    expect(
      tracker.observe({ scrollbackCount: 605, linesWrittenDelta: 4 }),
    ).toBe(4);
  });

  it("returns zero for zero-write observations", () => {
    const tracker = new TrimTracker(50);
    expect(tracker.observe({ scrollbackCount: 50, linesWrittenDelta: 0 })).toBe(
      0,
    );
  });

  it("never returns a negative shift when the count jumps externally", () => {
    const tracker = new TrimTracker(0);
    // Snapshot restore replaced the buffer: count grew without writes.
    expect(
      tracker.observe({ scrollbackCount: 300, linesWrittenDelta: 0 }),
    ).toBe(0);
    expect(
      tracker.observe({ scrollbackCount: 304, linesWrittenDelta: 4 }),
    ).toBe(0);
  });

  it("resynchronizes via reset after a clear", () => {
    const tracker = new TrimTracker(800);
    tracker.reset();
    expect(tracker.observe({ scrollbackCount: 6, linesWrittenDelta: 6 })).toBe(
      0,
    );
    tracker.reset(100);
    expect(
      tracker.observe({ scrollbackCount: 100, linesWrittenDelta: 2 }),
    ).toBe(2);
  });
});
