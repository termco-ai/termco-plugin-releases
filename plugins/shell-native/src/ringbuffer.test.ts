/**
 * BoundedRingBuffer behavior tests.
 */
import { describe, expect, it } from "vitest";
import { BoundedRingBuffer } from "./ringbuffer";

const s = (b: Uint8Array) => Buffer.from(b).toString("utf8");
const push = (buf: BoundedRingBuffer, str: string) => buf.push(new TextEncoder().encode(str));

describe("BoundedRingBuffer", () => {
  it("read_from_returns_all_when_within_cap", () => {
    const buf = new BoundedRingBuffer(16);
    push(buf, "hello world");
    const [bytes, off, dropped] = buf.readFrom(0);
    expect(s(bytes)).toBe("hello world");
    expect(off).toBe(11);
    expect(dropped).toBe(0);
  });

  it("read_from_skips_consumed_prefix", () => {
    const buf = new BoundedRingBuffer(16);
    push(buf, "hello world");
    const [bytes, off] = buf.readFrom(6);
    expect(s(bytes)).toBe("world");
    expect(off).toBe(11);
  });

  it("read_from_handles_wraparound", () => {
    const buf = new BoundedRingBuffer(8);
    push(buf, "abcdefgh");
    push(buf, "ijkl");
    const [bytes, off, dropped] = buf.readFrom(0);
    expect(s(bytes)).toBe("efghijkl");
    expect(off).toBe(12);
    expect(dropped).toBe(4);
  });

  it("read_from_clamps_to_oldest", () => {
    const buf = new BoundedRingBuffer(8);
    push(buf, "abcdefgh");
    push(buf, "ijkl");
    expect(s(buf.readFrom(0)[0])).toBe("efghijkl");
    expect(buf.readFrom(99)[0].length).toBe(0);
  });

  it("push_larger_than_cap_keeps_tail", () => {
    const buf = new BoundedRingBuffer(4);
    push(buf, "abcdefgh");
    const [bytes, off, dropped] = buf.readFrom(0);
    expect(s(bytes)).toBe("efgh");
    expect(off).toBe(8);
    expect(dropped).toBe(4);
  });
});
