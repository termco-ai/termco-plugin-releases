// Kept with the source-owning terminal plugin.
import { describe, expect, it } from "vitest";
import { applyDecMode, initialDecModes } from "./decModes";
import type { OscContext, ParserSink } from "./index";
import { PtyStreamParser } from "./index";

const enc = new TextEncoder();

/** Binary string -> bytes (latin1: each char is one byte, controls included). */
function B(s: string): Uint8Array {
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i) & 0xff;
  return out;
}

/** Bytes -> binary string, chunked to avoid spread/stack limits on big inputs. */
function latin1(u8: Uint8Array): string {
  let s = "";
  for (let i = 0; i < u8.length; i += 4096) {
    s += String.fromCharCode(...u8.subarray(i, i + 4096));
  }
  return s;
}

function concat(chunks: Uint8Array[]): Uint8Array {
  const total = chunks.reduce((n, c) => n + c.length, 0);
  const out = new Uint8Array(total);
  let off = 0;
  for (const c of chunks) {
    out.set(c, off);
    off += c.length;
  }
  return out;
}

function expectBytesEqual(actual: Uint8Array, expected: Uint8Array): void {
  if (actual.length === expected.length) {
    let i = 0;
    while (i < actual.length && actual[i] === expected[i]) i++;
    if (i === actual.length) return;
    throw new Error(
      `byte mismatch at ${i}: got 0x${actual[i].toString(16)}, want 0x${expected[i].toString(16)}`,
    );
  }
  throw new Error(
    `length mismatch: got ${actual.length}, want ${expected.length}`,
  );
}

function makeSink(cursor = { row: 4, col: 9 }) {
  const chunks: Uint8Array[] = [];
  const responses: string[] = [];
  /** Interleaved log of writes and responses, to assert ordering. */
  const events: string[] = [];
  let newlines = 0;
  const sink: ParserSink = {
    write(c) {
      chunks.push(c.slice()); // copy: the parser hands out subarrays
      for (const byte of c) if (byte === 0x0a) newlines++;
      events.push(`w:${latin1(c)}`);
    },
    respond(d) {
      responses.push(d);
      events.push(`r:${d}`);
    },
    currentBufferLine: () => newlines,
    cursorPosition: () => cursor,
  };
  return {
    sink,
    responses,
    events,
    written: () => latin1(concat(chunks)),
    writtenBytes: () => concat(chunks),
  };
}

/** Push `bytes` split at the given offsets (each in (0, len)). */
function pushSplit(
  parser: PtyStreamParser,
  sink: ParserSink,
  bytes: Uint8Array,
  cuts: number[],
): void {
  let prev = 0;
  for (const c of cuts) {
    parser.push(bytes.subarray(prev, c), sink);
    prev = c;
  }
  parser.push(bytes.subarray(prev), sink);
}

/** Run `check` on a fresh parser for every two-chunk split of `bytes`. */
function forEverySplit(
  bytes: Uint8Array,
  check: (run: (parser: PtyStreamParser, sink: ParserSink) => void) => void,
): void {
  for (let cut = 0; cut <= bytes.length; cut++) {
    check((parser, sink) => pushSplit(parser, sink, bytes, [cut]));
  }
}

/** Deterministic PRNG for the randomized-chunking fidelity pass. */
function mulberry32(seed: number): () => number {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

describe("decModes", () => {
  it("starts with everything off", () => {
    expect(initialDecModes()).toEqual({
      mouseTracking: "none",
      sgrMouse: false,
      bracketedPaste: false,
    });
  });

  it("toggles sgrMouse via 1006", () => {
    const m = initialDecModes();
    applyDecMode(m, [1006], true);
    expect(m.sgrMouse).toBe(true);
    applyDecMode(m, [1006], false);
    expect(m.sgrMouse).toBe(false);
  });

  it("toggles bracketedPaste via 2004", () => {
    const m = initialDecModes();
    applyDecMode(m, [2004], true);
    expect(m.bracketedPaste).toBe(true);
    applyDecMode(m, [2004], false);
    expect(m.bracketedPaste).toBe(false);
  });

  it("exposes the highest active tracking level", () => {
    const m = initialDecModes();
    applyDecMode(m, [1000], true);
    expect(m.mouseTracking).toBe("click");
    applyDecMode(m, [1003], true);
    expect(m.mouseTracking).toBe("motion");
    applyDecMode(m, [1003], false);
    expect(m.mouseTracking).toBe("click"); // 1000 still enabled
    applyDecMode(m, [1002], true);
    expect(m.mouseTracking).toBe("drag");
    applyDecMode(m, [1002], false);
    expect(m.mouseTracking).toBe("click");
    applyDecMode(m, [1000], false);
    expect(m.mouseTracking).toBe("none");
  });

  it("applies multi-param sets in one call", () => {
    const m = initialDecModes();
    applyDecMode(m, [1002, 1006], true);
    expect(m.mouseTracking).toBe("drag");
    expect(m.sgrMouse).toBe(true);
  });

  it("ignores unknown modes", () => {
    const m = initialDecModes();
    applyDecMode(m, [25, 1049, 47], true);
    expect(m).toEqual(initialDecModes());
  });

  it("works on a modes object not created by initialDecModes", () => {
    const m = {
      mouseTracking: "none" as const,
      sgrMouse: false,
      bracketedPaste: false,
    };
    applyDecMode(m, [1003], true);
    expect(m.mouseTracking).toBe("motion");
  });
});

// Streams with no handled/consumed sequences: parser output must equal input
// byte-for-byte, no matter how the stream is chunked.
const FIDELITY_STREAMS: [string, Uint8Array][] = [
  ["plain text", B("plain text\r\nline two\n")],
  [
    "sgr + cursor CSIs",
    B("\x1b[1;31mred\x1b[0m mid \x1b[2J\x1b[H\x1b[10;20Hx"),
  ],
  ["osc title BEL", B("\x1b]0;my title\x07after")],
  ["osc title ST", B("pre\x1b]2;t\x1b\\post")],
  ["osc hyperlink", B("\x1b]8;;http://a\x1b\\link\x1b]8;;\x1b\\")],
  ["dcs", B("\x1bP+q544e\x1b\\tail")],
  ["apc", B("a\x1b_Gf=100,a=T;AAAA\x1b\\b")],
  ["utf8 multibyte", enc.encode("héllo wörld — ✓ 中文\n")],
  ["raw C1 bytes pass through", B("a\x9db\x9bc\x90d\x9ce")],
  ["esc singles", B("\x1b7save\x1b8restore\x1bM\x1b=\x1b>")],
  [
    "decset/decrst forwarded",
    B("\x1b[?1002;1006h mouse \x1b[?1002l\x1b[?2004h"),
  ],
  ["bare BEL", B("a\x07b")],
  ["two OSC one chunk", B("\x1b]0;a\x07\x1b]2;b\x07")],
  ["osc aborted by ESC", B("\x1b]0;unterminated\x1b[31mred")],
  ["csi aborted by ESC", B("\x1b[1;\x1b[32mx")],
  ["esc esc", B("a\x1b\x1b[0mb")],
  ["osc inside dcs", B("\x1bPq\x1b]133;A\x07data\x1b\\end")],
  ["secondary DA forwarded", B("a\x1b[>cb")],
];

describe("passthrough byte fidelity", () => {
  for (const [name, bytes] of FIDELITY_STREAMS) {
    it(`${name}: whole-push and every two-chunk split`, () => {
      forEverySplit(bytes, (run) => {
        const parser = new PtyStreamParser();
        const s = makeSink();
        run(parser, s.sink);
        expectBytesEqual(s.writtenBytes(), bytes);
        expect(s.responses).toEqual([]);
      });
    });
  }

  it("randomized chunking over the concatenated corpus (seeded)", () => {
    const all = concat(FIDELITY_STREAMS.map(([, b]) => b));
    for (let seed = 1; seed <= 25; seed++) {
      const rand = mulberry32(seed);
      const parser = new PtyStreamParser();
      const s = makeSink();
      let off = 0;
      while (off < all.length) {
        const len = 1 + Math.floor(rand() * 11);
        parser.push(all.subarray(off, off + len), s.sink);
        off += len;
      }
      expectBytesEqual(s.writtenBytes(), all);
    }
  });
});

describe("OSC dispatch", () => {
  it("parses code and data (133;A)", () => {
    const parser = new PtyStreamParser();
    const s = makeSink();
    const seen: string[] = [];
    parser.registerOscHandler(133, (data) => {
      seen.push(data);
      return true;
    });
    parser.push(B("pre\x1b]133;A\x07post"), s.sink);
    expect(seen).toEqual(["A"]);
    expect(s.written()).toBe("prepost");
  });

  it("passes full data after the first semicolon (7, 52)", () => {
    const parser = new PtyStreamParser();
    const s = makeSink();
    const seen: [number, string][] = [];
    parser.registerOscHandler(7, (data) => {
      seen.push([7, data]);
      return true;
    });
    parser.registerOscHandler(52, (data) => {
      seen.push([52, data]);
      return true;
    });
    parser.push(B("\x1b]7;file://host/a/b\x07\x1b]52;c;Zm9vYmFy\x07"), s.sink);
    expect(seen).toEqual([
      [7, "file://host/a/b"],
      [52, "c;Zm9vYmFy"],
    ]);
    expect(s.written()).toBe("");
  });

  it("dispatches identically for BEL and ST terminators", () => {
    const parser = new PtyStreamParser();
    const s = makeSink();
    const seen: string[] = [];
    parser.registerOscHandler(133, (data) => {
      seen.push(data);
      return true;
    });
    parser.push(B("\x1b]133;B\x07\x1b]133;C\x1b\\"), s.sink);
    expect(seen).toEqual(["B", "C"]);
    expect(s.written()).toBe("");
  });

  it("forwards the raw OSC when the handler declines", () => {
    const parser = new PtyStreamParser();
    const s = makeSink();
    let calls = 0;
    parser.registerOscHandler(133, () => {
      calls++;
      return false;
    });
    const input = B("a\x1b]133;X\x07b");
    parser.push(input, s.sink);
    expect(calls).toBe(1);
    expectBytesEqual(s.writtenBytes(), input);
  });

  it("forwards unhandled OSC codes verbatim", () => {
    const parser = new PtyStreamParser();
    const s = makeSink();
    parser.registerOscHandler(133, () => true);
    const input = B("\x1b]0;title\x07\x1b]8;;http://x\x1b\\\x1b]10;?\x07");
    parser.push(input, s.sink);
    expectBytesEqual(s.writtenBytes(), input);
  });

  it("handles OSC with a code but no data", () => {
    const parser = new PtyStreamParser();
    const s = makeSink();
    const seen: string[] = [];
    parser.registerOscHandler(133, (data) => {
      seen.push(data);
      return true;
    });
    parser.push(B("\x1b]133\x07"), s.sink);
    expect(seen).toEqual([""]);
    expect(s.written()).toBe("");
  });

  it("calls handlers in registration order until one consumes", () => {
    const parser = new PtyStreamParser();
    const s = makeSink();
    const order: string[] = [];
    parser.registerOscHandler(133, () => {
      order.push("first");
      return false;
    });
    parser.registerOscHandler(133, () => {
      order.push("second");
      return true;
    });
    parser.registerOscHandler(133, () => {
      order.push("third");
      return true;
    });
    parser.push(B("\x1b]133;A\x07"), s.sink);
    expect(order).toEqual(["first", "second"]);
    expect(s.written()).toBe("");
  });

  it("dispose unregisters a handler; the OSC is forwarded again", () => {
    const parser = new PtyStreamParser();
    const s = makeSink();
    let calls = 0;
    const dispose = parser.registerOscHandler(133, () => {
      calls++;
      return true;
    });
    parser.push(B("\x1b]133;A\x07"), s.sink);
    dispose();
    const input = B("\x1b]133;B\x07");
    parser.push(input, s.sink);
    expect(calls).toBe(1);
    expectBytesEqual(s.writtenBytes(), input);
  });

  it("forwards OSC with a non-numeric code", () => {
    const parser = new PtyStreamParser();
    const s = makeSink();
    parser.registerOscHandler(133, () => true);
    const input = B("\x1b]I;icon\x07x");
    parser.push(input, s.sink);
    expectBytesEqual(s.writtenBytes(), input);
  });
});

describe("bufferLine context", () => {
  it("reflects everything written before the OSC", () => {
    const parser = new PtyStreamParser();
    const s = makeSink();
    const lines: number[] = [];
    parser.registerOscHandler(133, (_data, ctx: OscContext) => {
      lines.push(ctx.bufferLine);
      return true;
    });
    parser.push(B("one\ntwo\n\x1b]133;A\x07three"), s.sink);
    expect(lines).toEqual([2]);
    expect(s.written()).toBe("one\ntwo\nthree");
  });

  it("advances across multiple prompts in one chunk", () => {
    const parser = new PtyStreamParser();
    const s = makeSink();
    const lines: number[] = [];
    parser.registerOscHandler(133, (_data, ctx) => {
      lines.push(ctx.bufferLine);
      return true;
    });
    parser.push(B("a\n\x1b]133;A\x07b\nc\n\x1b]133;A\x07"), s.sink);
    expect(lines).toEqual([1, 3]);
  });

  it("is exact for every chunking of the stream", () => {
    const bytes = B("x\ny\n\x1b]133;A\x1b\\z\n\x1b]133;A\x07");
    forEverySplit(bytes, (run) => {
      const parser = new PtyStreamParser();
      const s = makeSink();
      const lines: number[] = [];
      parser.registerOscHandler(133, (_data, ctx) => {
        lines.push(ctx.bufferLine);
        return true;
      });
      run(parser, s.sink);
      expect(lines).toEqual([2, 3]);
      expect(s.written()).toBe("x\ny\nz\n");
    });
  });
});

describe("chunk-split torture", () => {
  it("consumed OSC (BEL) split at every boundary", () => {
    const bytes = B("pre\x1b]133;A;extra\x07post");
    forEverySplit(bytes, (run) => {
      const parser = new PtyStreamParser();
      const s = makeSink();
      const seen: string[] = [];
      parser.registerOscHandler(133, (data) => {
        seen.push(data);
        return true;
      });
      run(parser, s.sink);
      expect(seen).toEqual(["A;extra"]);
      expect(s.written()).toBe("prepost");
    });
  });

  it("consumed OSC (ST) split at every boundary, ESC-\\ included", () => {
    const bytes = B("pre\x1b]7;file:///tmp\x1b\\post");
    forEverySplit(bytes, (run) => {
      const parser = new PtyStreamParser();
      const s = makeSink();
      const seen: string[] = [];
      parser.registerOscHandler(7, (data) => {
        seen.push(data);
        return true;
      });
      run(parser, s.sink);
      expect(seen).toEqual(["file:///tmp"]);
      expect(s.written()).toBe("prepost");
    });
  });

  it("consumed OSC (ST) at every three-chunk split", () => {
    const bytes = B("a\x1b]133;D;0\x1b\\b");
    for (let c1 = 0; c1 <= bytes.length; c1++) {
      for (let c2 = c1; c2 <= bytes.length; c2++) {
        const parser = new PtyStreamParser();
        const s = makeSink();
        const seen: string[] = [];
        parser.registerOscHandler(133, (data) => {
          seen.push(data);
          return true;
        });
        pushSplit(parser, s.sink, bytes, [c1, c2]);
        expect(seen).toEqual(["D;0"]);
        expect(s.written()).toBe("ab");
      }
    }
  });

  it("ESC as the final byte of a chunk defers the write decision", () => {
    const parser = new PtyStreamParser();
    const s = makeSink();
    parser.registerOscHandler(133, () => true);
    parser.push(B("text\x1b"), s.sink);
    expect(s.written()).toBe("text"); // ESC held: could start a consumed seq
    parser.push(B("]133;A\x07done"), s.sink);
    expect(s.written()).toBe("textdone");
  });

  it("DSR split at every boundary: consumed, answered once", () => {
    const bytes = B("a\x1b[6nb");
    forEverySplit(bytes, (run) => {
      const parser = new PtyStreamParser();
      const s = makeSink();
      run(parser, s.sink);
      expect(s.written()).toBe("ab");
      expect(s.responses).toEqual(["\x1b[5;10R"]);
    });
  });

  it("DECSET split at every boundary: tracked and forwarded", () => {
    const bytes = B("x\x1b[?1002;1006hy");
    forEverySplit(bytes, (run) => {
      const parser = new PtyStreamParser();
      const s = makeSink();
      run(parser, s.sink);
      expectBytesEqual(s.writtenBytes(), bytes);
      expect(parser.modes.mouseTracking).toBe("drag");
      expect(parser.modes.sgrMouse).toBe(true);
    });
  });

  it("two consumed OSC in one chunk", () => {
    const parser = new PtyStreamParser();
    const s = makeSink();
    const seen: string[] = [];
    parser.registerOscHandler(133, (data) => {
      seen.push(data);
      return true;
    });
    parser.push(B("a\x1b]133;A\x07b\x1b]133;C\x1b\\c"), s.sink);
    expect(seen).toEqual(["A", "C"]);
    expect(s.written()).toBe("abc");
  });

  it("OSC inside a DCS payload is never dispatched", () => {
    const bytes = B("\x1bPq\x1b]133;A\x07data\x1b\\end");
    forEverySplit(bytes, (run) => {
      const parser = new PtyStreamParser();
      const s = makeSink();
      let calls = 0;
      parser.registerOscHandler(133, () => {
        calls++;
        return true;
      });
      run(parser, s.sink);
      expect(calls).toBe(0);
      expectBytesEqual(s.writtenBytes(), bytes);
    });
  });

  it("2 MiB OSC overflow forwards raw and never dispatches", () => {
    const cap = 2 * 1024 * 1024;
    const bytes = B(`\x1b]133;${"A".repeat(cap + 64)}\x07tail`);
    for (const cuts of [[], [bytes.length >> 1]]) {
      const parser = new PtyStreamParser();
      const s = makeSink();
      let calls = 0;
      parser.registerOscHandler(133, () => {
        calls++;
        return true;
      });
      pushSplit(parser, s.sink, bytes, cuts);
      expect(calls).toBe(0);
      expectBytesEqual(s.writtenBytes(), bytes);
    }
  });

  it("overlong CSI (>256 bytes) is flushed raw and parsing recovers", () => {
    const bytes = B(`a\x1b[${"1;".repeat(200)}mb\x1b[31mc`);
    for (const cuts of [[], [5], [300]]) {
      const parser = new PtyStreamParser();
      const s = makeSink();
      pushSplit(parser, s.sink, bytes, cuts);
      expectBytesEqual(s.writtenBytes(), bytes);
    }
  });

  it("lone carried ESC followed by a plain byte is forwarded", () => {
    const parser = new PtyStreamParser();
    const s = makeSink();
    parser.push(B("\x1b"), s.sink);
    expect(s.written()).toBe("");
    parser.push(B("7"), s.sink);
    expect(s.written()).toBe("\x1b7");
  });
});

describe("DEC private modes over the wire", () => {
  it("tracks h/l transitions and precedence from real sequences", () => {
    const parser = new PtyStreamParser();
    const s = makeSink();
    parser.push(B("\x1b[?1000h"), s.sink);
    expect(parser.modes.mouseTracking).toBe("click");
    parser.push(B("\x1b[?1003h"), s.sink);
    expect(parser.modes.mouseTracking).toBe("motion");
    parser.push(B("\x1b[?1003l"), s.sink);
    expect(parser.modes.mouseTracking).toBe("click");
    parser.push(B("\x1b[?1000l"), s.sink);
    expect(parser.modes.mouseTracking).toBe("none");
  });

  it("tracks bracketed paste", () => {
    const parser = new PtyStreamParser();
    const s = makeSink();
    parser.push(B("\x1b[?2004h"), s.sink);
    expect(parser.modes.bracketedPaste).toBe(true);
    parser.push(B("\x1b[?2004l"), s.sink);
    expect(parser.modes.bracketedPaste).toBe(false);
  });

  it("forwards DECSET/DECRST to the core", () => {
    const parser = new PtyStreamParser();
    const s = makeSink();
    const input = B("\x1b[?1002;1006h\x1b[?2004h");
    parser.push(input, s.sink);
    expectBytesEqual(s.writtenBytes(), input);
  });
});

describe("DSR / DA queries", () => {
  it("answers CSI 6 n with the sink's cursor position", () => {
    const parser = new PtyStreamParser();
    const s = makeSink({ row: 0, col: 0 });
    parser.push(B("\x1b[6n"), s.sink);
    expect(s.responses).toEqual(["\x1b[1;1R"]);
    expect(s.written()).toBe("");
  });

  it("answers CSI 5 n with OK status", () => {
    const parser = new PtyStreamParser();
    const s = makeSink();
    parser.push(B("\x1b[5n"), s.sink);
    expect(s.responses).toEqual(["\x1b[0n"]);
    expect(s.written()).toBe("");
  });

  it("answers primary DA (CSI c and CSI 0 c) as VT102", () => {
    const parser = new PtyStreamParser();
    const s = makeSink();
    parser.push(B("\x1b[c\x1b[0c"), s.sink);
    expect(s.responses).toEqual(["\x1b[?6c", "\x1b[?6c"]);
    expect(s.written()).toBe("");
  });

  it("forwards secondary DA (CSI > c) unanswered", () => {
    const parser = new PtyStreamParser();
    const s = makeSink();
    const input = B("\x1b[>c\x1b[>0c");
    parser.push(input, s.sink);
    expect(s.responses).toEqual([]);
    expectBytesEqual(s.writtenBytes(), input);
  });

  it("forwards DECDSR (CSI ? 6 n) unanswered", () => {
    const parser = new PtyStreamParser();
    const s = makeSink();
    const input = B("\x1b[?6n");
    parser.push(input, s.sink);
    expect(s.responses).toEqual([]);
    expectBytesEqual(s.writtenBytes(), input);
  });

  it("responds in stream order relative to surrounding writes", () => {
    const parser = new PtyStreamParser();
    const s = makeSink();
    parser.push(B("a\x1b[6nb"), s.sink);
    expect(s.events).toEqual(["w:a", "r:\x1b[5;10R", "w:b"]);
  });
});

describe("onAfterWrite", () => {
  it("fires once per push that wrote, even with multiple writes", () => {
    const parser = new PtyStreamParser();
    const s = makeSink();
    let fired = 0;
    parser.onAfterWrite(() => fired++);
    parser.registerOscHandler(133, () => true);
    // pre + consumed OSC + post: two separate sink writes, one callback.
    parser.push(B("pre\x1b]133;A\x07post"), s.sink);
    expect(fired).toBe(1);
    parser.push(B("more"), s.sink);
    expect(fired).toBe(2);
  });

  it("does not fire when a push only consumed an OSC", () => {
    const parser = new PtyStreamParser();
    const s = makeSink();
    let fired = 0;
    parser.onAfterWrite(() => fired++);
    parser.registerOscHandler(133, () => true);
    parser.push(B("\x1b]133;A\x07"), s.sink);
    expect(fired).toBe(0);
  });

  it("does not fire when a push only answered a query", () => {
    const parser = new PtyStreamParser();
    const s = makeSink();
    let fired = 0;
    parser.onAfterWrite(() => fired++);
    parser.push(B("\x1b[6n"), s.sink);
    expect(s.responses).toEqual(["\x1b[5;10R"]);
    expect(fired).toBe(0);
  });

  it("does not fire when a push only buffered a partial sequence", () => {
    const parser = new PtyStreamParser();
    const s = makeSink();
    let fired = 0;
    parser.onAfterWrite(() => fired++);
    parser.push(B("\x1b]133;par"), s.sink);
    expect(fired).toBe(0);
    parser.push(B("tial\x07x"), s.sink); // completes: "x" is written
    expect(fired).toBe(1);
  });

  it("fires when an unhandled OSC is forwarded", () => {
    const parser = new PtyStreamParser();
    const s = makeSink();
    let fired = 0;
    parser.onAfterWrite(() => fired++);
    parser.push(B("\x1b]0;title\x07"), s.sink);
    expect(fired).toBe(1);
  });

  it("dispose stops the callback", () => {
    const parser = new PtyStreamParser();
    const s = makeSink();
    let fired = 0;
    const dispose = parser.onAfterWrite(() => fired++);
    parser.push(B("a"), s.sink);
    dispose();
    parser.push(B("b"), s.sink);
    expect(fired).toBe(1);
  });

  it("tolerates an empty push", () => {
    const parser = new PtyStreamParser();
    const s = makeSink();
    let fired = 0;
    parser.onAfterWrite(() => fired++);
    parser.push(new Uint8Array(0), s.sink);
    expect(fired).toBe(0);
    expect(s.written()).toBe("");
  });
});

describe("reset", () => {
  it("drops mid-OSC state so the next push starts clean", () => {
    const parser = new PtyStreamParser();
    const s = makeSink();
    let calls = 0;
    parser.registerOscHandler(133, () => {
      calls++;
      return true;
    });
    parser.push(B("\x1b]133;par"), s.sink);
    parser.reset();
    parser.push(B("tial\x07x"), s.sink);
    expect(calls).toBe(0);
    // The orphaned tail is plain passthrough now (BEL included).
    expect(s.written()).toBe("tial\x07x");
  });

  it("keeps DEC modes: they belong to the still-running PTY app", () => {
    const parser = new PtyStreamParser();
    const s = makeSink();
    parser.push(B("\x1b[?2004h\x1b[?1003h"), s.sink);
    parser.reset();
    expect(parser.modes.bracketedPaste).toBe(true);
    expect(parser.modes.mouseTracking).toBe("motion");
  });

  it("parses normally after reset", () => {
    const parser = new PtyStreamParser();
    const s = makeSink();
    const seen: string[] = [];
    parser.registerOscHandler(133, (data) => {
      seen.push(data);
      return true;
    });
    parser.push(B("\x1b]0;half-open"), s.sink);
    parser.reset();
    parser.push(B("a\x1b]133;A\x07b"), s.sink);
    expect(seen).toEqual(["A"]);
    expect(s.written()).toBe("ab");
  });
});
