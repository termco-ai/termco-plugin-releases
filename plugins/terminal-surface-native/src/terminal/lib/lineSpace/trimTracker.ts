/**
 * Detects scrollback trimming from core observations. The wterm core exposes
 * only the retained scrollback count; it never reports evictions, and ghostty
 * trims page-granular (hundreds of lines at once), so the count plateaus or
 * even drops while output keeps flowing. The caller knows how many lines each
 * write burst pushed into scrollback (grid cursor bookkeeping); whenever the
 * count grew by less than that, the difference is trimmed lines and must be
 * forwarded to TerminalLineSpace.notifyTrim().
 */

export type TrimObservation = {
  /** Core's retained scrollback line count, read after the write burst. */
  scrollbackCount: number;
  /**
   * Lines this burst pushed into scrollback (lines that scrolled off the top
   * of the grid), >= 0. Zero for bursts that never scrolled.
   */
  linesWrittenDelta: number;
};

export class TrimTracker {
  private prevCount: number;

  /** Pass the core's scrollback count at attach time (0 for a fresh buffer). */
  constructor(initialScrollbackCount = 0) {
    this.prevCount = initialScrollbackCount;
  }

  /**
   * Feed one post-burst observation; returns the trim shift to pass to
   * TerminalLineSpace.notifyTrim() (0 when nothing was evicted).
   */
  observe(obs: TrimObservation): number {
    const growth = obs.scrollbackCount - this.prevCount;
    this.prevCount = obs.scrollbackCount;
    // Growth beyond what was pushed means the buffer was replaced under us
    // (snapshot restore); that is a resync concern, never a negative trim.
    return Math.max(0, obs.linesWrittenDelta - growth);
  }

  /**
   * Resynchronize after a clear/reset or snapshot restore, where the count
   * jumps without any lines having been written through us.
   */
  reset(scrollbackCount = 0): void {
    this.prevCount = scrollbackCount;
  }
}
