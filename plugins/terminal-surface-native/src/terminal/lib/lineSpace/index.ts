/**
 * Absolute line space over the wterm terminal buffer, replacing xterm.js
 * IMarker. The buffer is a ring: lines scroll from the live grid into
 * scrollback and old scrollback is eventually trimmed, shifting every buffer
 * index. We assign each line a stable absolute coordinate
 * (absolute = bufferLine + trimOffset) so features like command blocks can
 * hold references that survive trimming; an anchor is disposed the moment
 * its line is evicted. Resize never reflows the buffer (verified), so buffer
 * indices only move on trim, rebase, or reset.
 */

;

export type Anchor = {
  readonly id: number;
  readonly absoluteLine: number;
  /** Current buffer line (absolute - trimOffset), or -1 once disposed. */
  readonly line: number;
  readonly isDisposed: boolean;
  dispose(): void;
  /** Returns unsubscribe; fires on trim-eviction and manual dispose alike. */
  onDispose(cb: () => void): () => void;
};

type AnchorOps = {
  trimOffset(): number;
  detach(anchor: LineAnchor): void;
};

class LineAnchor implements Anchor {
  private disposed = false;
  private listeners: (() => void)[] = [];

  constructor(
    readonly id: number,
    readonly absoluteLine: number,
    private readonly ops: AnchorOps,
  ) {}

  get line(): number {
    return this.disposed ? -1 : this.absoluteLine - this.ops.trimOffset();
  }

  get isDisposed(): boolean {
    return this.disposed;
  }

  dispose(): void {
    if (this.disposed) return;
    this.ops.detach(this);
    this.markDisposed();
  }

  onDispose(cb: () => void): () => void {
    if (this.disposed) return () => {};
    this.listeners.push(cb);
    return () => {
      const i = this.listeners.indexOf(cb);
      if (i >= 0) this.listeners.splice(i, 1);
    };
  }

  /** Space-internal: flips state and notifies without touching the index. */
  markDisposed(): void {
    if (this.disposed) return;
    this.disposed = true;
    const listeners = this.listeners;
    this.listeners = [];
    for (const cb of listeners) cb();
  }
}

export class TerminalLineSpace {
  private offset = 0;
  private nextId = 1;
  // Live anchors sorted ascending by absoluteLine (creation order on ties).
  private live: LineAnchor[] = [];
  private readonly ops: AnchorOps = {
    trimOffset: () => this.offset,
    detach: (anchor) => {
      const i = this.live.indexOf(anchor);
      if (i >= 0) this.live.splice(i, 1);
    },
  };

  get trimOffset(): number {
    return this.offset;
  }

  toAbsolute(bufferLine: number): number {
    return bufferLine + this.offset;
  }

  toBuffer(absoluteLine: number): number {
    return absoluteLine - this.offset;
  }

  /** Create an anchor at an absolute line (see toAbsolute). */
  createAnchor(absoluteLine: number): Anchor {
    const anchor = new LineAnchor(this.nextId++, absoluteLine, this.ops);
    let lo = 0;
    let hi = this.live.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (this.live[mid].absoluteLine <= absoluteLine) lo = mid + 1;
      else hi = mid;
    }
    this.live.splice(lo, 0, anchor);
    return anchor;
  }

  /** All live anchors, ascending by absoluteLine. */
  anchors(): readonly Anchor[] {
    return this.live.slice();
  }

  /** Trimming advanced: shift trimOffset and dispose anchors that fell off. */
  notifyTrim(shift: number): void {
    if (shift <= 0) return;
    this.offset += shift;
    this.evictBelow(this.offset);
  }

  /**
   * Snapshot restore: rebase the space so buffer line 0 == baseAbsolute;
   * anchors below baseAbsolute no longer exist in the buffer and are evicted.
   */
  rebase(baseAbsolute: number): void {
    this.offset = baseAbsolute;
    this.evictBelow(baseAbsolute);
  }

  /**
   * Terminal cleared/reset: dispose everything. trimOffset continues
   * monotonically from atAbsolute (default: current top), so absolute lines
   * issued after the reset never collide with lines issued before it.
   */
  notifyReset(atAbsolute?: number): void {
    this.offset = Math.max(this.offset, atAbsolute ?? this.offset);
    const all = this.live;
    this.live = [];
    for (const anchor of all) anchor.markDisposed();
  }

  private evictBelow(minAbsolute: number): void {
    let n = 0;
    while (n < this.live.length && this.live[n].absoluteLine < minAbsolute) n++;
    if (n === 0) return;
    const evicted = this.live.splice(0, n);
    for (const anchor of evicted) anchor.markDisposed();
  }
}
