/**
 * Bounded ring buffer for background-process output. Offset-based reads;
 * oldest bytes drop once `cap` is exceeded.
 */
export class BoundedRingBuffer {
  private buf: number[] = [];
  private readonly cap: number;
  private nextOffset = 0;
  private dropped = 0;

  constructor(cap: number) {
    this.cap = cap;
  }

  push(data: Uint8Array): void {
    this.nextOffset += data.length;
    if (data.length >= this.cap) {
      const keepFrom = data.length - this.cap;
      this.dropped += this.buf.length + keepFrom;
      this.buf = Array.from(data.subarray(keepFrom));
      return;
    }
    const overflow = Math.max(0, this.buf.length + data.length - this.cap);
    if (overflow > 0) {
      this.buf.splice(0, overflow);
      this.dropped += overflow;
    }
    for (const b of data) this.buf.push(b);
  }

  /** Returns [bytes since `since`, nextOffset, dropped]. */
  readFrom(since: number): [Uint8Array, number, number] {
    const oldest = this.nextOffset - this.buf.length;
    const start = Math.max(since, oldest);
    const skip = start - oldest;
    const out = skip < this.buf.length ? this.buf.slice(skip) : [];
    return [Uint8Array.from(out), this.nextOffset, this.dropped];
  }
}
