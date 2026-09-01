/**
 * PTY stream pre-parser. All PTY output flows through here BEFORE reaching
 * the wterm terminal engine, because the ghostty wasm core cannot host app
 * callbacks: we must (a) extract OSC 7/52/133 for shell integration and
 * clipboard, with an exact buffer-line context, (b) shadow DEC private modes
 * (mouse/bracketed paste) so input encoding can consult them, and (c) answer
 * query sequences (DSR, primary DA) the core does not. Everything else is
 * forwarded byte-perfectly — unhandled spans are emitted as zero-copy
 * subarrays of the input, and sequences that straddle chunk boundaries are
 * buffered and re-emitted exactly.
 */

import {
  applyDecMode,
  type DecPrivateModes,
  initialDecModes,
} from "./decModes";

export type { DecPrivateModes,  } from "./decModes";
;

export type OscContext = {
  /** scrollbackCount + cursor.row at the moment all preceding bytes were written. */
  bufferLine: number;
};

/** Return true to consume the OSC (it will not be forwarded to the core). */
export type OscHandler = (data: string, ctx: OscContext) => boolean;

export type ParserSink = {
  /** Write a passthrough span to the terminal core (synchronous). */
  write(chunk: Uint8Array): void;
  /** Write a response back to the PTY (answers to DSR/DA queries). */
  respond(data: string): void;
  /** Query the core AFTER preceding writes: absolute buffer line of the cursor. */
  currentBufferLine(): number;
  /** Cursor column (0-based) for DSR 6n answers. */
  cursorPosition(): { row: number; col: number };
};

const ESC = 0x1b;
const BEL = 0x07;

// Titles and hyperlinks are small; anything past this is a hostile or broken
// stream. On overflow the raw bytes are forwarded so the core stays in sync.
const OSC_CAP = 2 * 1024 * 1024;
const CSI_CAP = 256;

type State =
  | "ground"
  | "esc"
  | "csi"
  | "osc"
  | "oscEsc" // saw ESC inside an OSC payload, awaiting `\` (ST)
  | "str" // DCS/SOS/PM/APC: forwarded verbatim, ST-terminated only
  | "strEsc"
  | "oscOverflow" // OSC past OSC_CAP: stream through until terminator
  | "overflowEsc";

const textDecoder = new TextDecoder();

export class PtyStreamParser {
  readonly modes: DecPrivateModes = initialDecModes();

  private state: State = "ground";
  /** Raw bytes of an in-flight sequence carried over from previous push()es. */
  private carry: number[] = [];
  /** OSC payload bytes (between `]` and the terminator), capped at OSC_CAP. */
  private oscPayload: number[] = [];
  /** CSI params/intermediates (between `[` and the final byte). */
  private csiBuf = "";
  private handlers = new Map<number, OscHandler[]>();
  private afterWrite = new Set<() => void>();
  private scrollbackErase = new Set<() => void>();

  registerOscHandler(code: number, handler: OscHandler): () => void {
    let list = this.handlers.get(code);
    if (!list) {
      list = [];
      this.handlers.set(code, list);
    }
    list.push(handler);
    return () => {
      const idx = list.indexOf(handler);
      if (idx >= 0) list.splice(idx, 1);
    };
  }

  /** Fires once per push() that wrote at least one byte to the sink. */
  onAfterWrite(cb: () => void): () => void {
    this.afterWrite.add(cb);
    return () => {
      this.afterWrite.delete(cb);
    };
  }

  /**
   * Fires when the app erases the scrollback (CSI 3 J — `clear`, ⌘K).
   * Line anchors above the grid are invalid from this point on.
   */
  onScrollbackErase(cb: () => void): () => void {
    this.scrollbackErase.add(cb);
    return () => {
      this.scrollbackErase.delete(cb);
    };
  }

  /**
   * Drop mid-sequence parse state (terminal respawn / clear). DEC modes are
   * NOT reset: they belong to the PTY application, which is still running.
   */
  reset(): void {
    this.state = "ground";
    this.carry = [];
    this.oscPayload = [];
    this.csiBuf = "";
  }

  push(bytes: Uint8Array, sink: ParserSink): void {
    const n = bytes.length;
    let wrote = false;

    // Open passthrough span [spanStart, …): bytes that will be forwarded
    // verbatim. -1 while the chunk head still belongs to a carried sequence.
    // In str/oscOverflow every byte is forwarded, so the span opens at 0.
    let spanStart =
      this.state === "ground" ||
      this.state === "str" ||
      this.state === "oscOverflow"
        ? 0
        : -1;
    // Index of the active sequence's ESC in this chunk; -1 when the sequence
    // started in a previous push (its bytes live in this.carry).
    let seqStart = -1;
    // Index of a pending in-payload ESC (oscEsc/strEsc/overflowEsc) seen in
    // this chunk; -1 when that ESC arrived in a previous push (last carry byte).
    let escIdx = -1;

    const write = (b: Uint8Array): void => {
      if (b.length === 0) return;
      sink.write(b);
      wrote = true;
    };
    const flushCarry = (): void => {
      if (this.carry.length) write(Uint8Array.from(this.carry));
      this.carry = [];
    };
    /** Flush the open span up to (not including) `end`. */
    const flushSpanTo = (end: number): void => {
      if (spanStart >= 0 && end > spanStart) {
        write(bytes.subarray(spanStart, end));
      }
    };
    /**
     * The active sequence resolved as forward-verbatim: emit any carried
     * prefix; the in-chunk part rides in the passthrough span (zero-copy).
     */
    const forwardSeq = (): void => {
      if (seqStart < 0) {
        flushCarry();
        spanStart = 0; // carried sequences always start the chunk
      }
      seqStart = -1;
    };

    /** `termEnd` = index just past the last terminator byte. */
    const dispatchOsc = (termEnd: number): void => {
      const payload = textDecoder.decode(Uint8Array.from(this.oscPayload));
      this.oscPayload = [];
      let code = -1;
      let data = "";
      const semi = payload.indexOf(";");
      const head = semi >= 0 ? payload.slice(0, semi) : payload;
      if (/^\d{1,10}$/.test(head)) {
        code = Number(head);
        data = semi >= 0 ? payload.slice(semi + 1) : "";
      }
      const list = code >= 0 ? this.handlers.get(code) : undefined;
      if (list && list.length > 0) {
        // Flush everything before this OSC so currentBufferLine() reflects
        // the exact stream position of the sequence.
        if (seqStart >= 0) flushSpanTo(seqStart);
        const ctx: OscContext = { bufferLine: sink.currentBufferLine() };
        let consumed = false;
        for (const h of [...list]) {
          if (h(data, ctx)) {
            consumed = true;
            break;
          }
        }
        if (consumed) {
          this.carry = [];
        } else {
          flushCarry();
          write(bytes.subarray(Math.max(seqStart, 0), termEnd));
        }
        spanStart = termEnd;
        seqStart = -1;
      } else {
        // No handler: titles (0/2), hyperlinks (8), colors (10/11), … must
        // reach the core verbatim.
        forwardSeq();
      }
      this.state = "ground";
    };

    /** `i` = index of the CSI final byte. */
    const resolveCsi = (i: number, finalByte: number): void => {
      const content = this.csiBuf;
      this.csiBuf = "";
      const fin = String.fromCharCode(finalByte);
      let response: string | null = null;
      if (fin === "n" && content === "6") {
        const { row, col } = sink.cursorPosition();
        response = `\x1b[${row + 1};${col + 1}R`;
      } else if (fin === "n" && content === "5") {
        response = "\x1b[0n";
      } else if (fin === "c" && (content === "" || content === "0")) {
        response = "\x1b[?6c"; // primary DA: claim VT102
      } else if ((fin === "h" || fin === "l") && content.startsWith("?")) {
        const params = content
          .slice(1)
          .split(";")
          .map((s) => Number.parseInt(s, 10))
          .filter((p) => Number.isFinite(p));
        applyDecMode(this.modes, params, fin === "h");
      } else if (fin === "J" && content === "3") {
        for (const cb of this.scrollbackErase) cb();
      }
      if (response !== null) {
        // A query the core cannot answer: consume it, answer the PTY directly.
        if (seqStart >= 0) flushSpanTo(seqStart);
        this.carry = [];
        sink.respond(response);
        spanStart = i + 1;
        seqStart = -1;
      } else {
        // Everything else — including DECSET/DECRST and secondary DA — is
        // forwarded so the core sees the same stream the app emitted.
        forwardSeq();
      }
      this.state = "ground";
    };

    let i = 0;
    while (i < n) {
      const b = bytes[i];
      switch (this.state) {
        case "ground": {
          // 7-bit ESC only: the 8-bit C1 introducers (0x9b/0x9d) collide
          // with UTF-8 continuation bytes and must pass through untouched.
          const esc = bytes.indexOf(ESC, i);
          if (esc < 0) {
            i = n;
            break;
          }
          seqStart = esc;
          this.state = "esc";
          i = esc + 1;
          break;
        }
        case "esc": {
          if (b === 0x5d /* ] */) {
            this.state = "osc";
            this.oscPayload = [];
          } else if (b === 0x5b /* [ */) {
            this.state = "csi";
            this.csiBuf = "";
          } else if (b === 0x50 || b === 0x58 || b === 0x5e || b === 0x5f) {
            // DCS/SOS/PM/APC are never consumed, so the string rides through
            // the span; only a trailing ESC is held back at chunk end.
            forwardSeq();
            this.state = "str";
          } else if (b === ESC) {
            // ESC ESC: forward the first, the second starts a new sequence.
            forwardSeq();
            seqStart = i;
          } else {
            // ESC 7, ESC =, ESC M, …: forward ESC + byte untouched.
            forwardSeq();
            this.state = "ground";
          }
          i++;
          break;
        }
        case "csi": {
          if (b === ESC) {
            // Malformed: ESC aborts a CSI. Forward what we have — the core's
            // parser aborts identically, so both stay in lockstep.
            this.csiBuf = "";
            forwardSeq();
            seqStart = i;
            this.state = "esc";
          } else if (b >= 0x40 && b <= 0x7e) {
            resolveCsi(i, b);
          } else if (this.csiBuf.length >= CSI_CAP) {
            // Runaway CSI: stop parsing, flush raw, fall back to ground.
            this.csiBuf = "";
            forwardSeq();
            this.state = "ground";
          } else {
            this.csiBuf += String.fromCharCode(b);
          }
          i++;
          break;
        }
        case "osc": {
          if (b === BEL) {
            dispatchOsc(i + 1);
          } else if (b === ESC) {
            escIdx = i;
            this.state = "oscEsc";
          } else if (this.oscPayload.length >= OSC_CAP) {
            // Overflow: forward the raw prefix (including this byte, which
            // rides in the span) and stream the rest through with no dispatch.
            this.oscPayload = [];
            forwardSeq();
            this.state = "oscOverflow";
          } else {
            this.oscPayload.push(b);
          }
          i++;
          break;
        }
        case "oscEsc": {
          if (b === 0x5c /* \ */) {
            dispatchOsc(i + 1);
            escIdx = -1;
            i++;
          } else {
            // ESC without `\` aborts the OSC (VT behavior). Forward its raw
            // bytes and reprocess this byte with the pending ESC as the
            // introducer of a new sequence, keeping us in lockstep with the
            // core — which aborts on the same byte.
            this.oscPayload = [];
            if (escIdx >= 0) {
              if (seqStart < 0) {
                flushCarry();
                spanStart = 0;
              }
              seqStart = escIdx; // OSC prefix before the ESC rides in the span
            } else {
              // The ESC is the last carried byte: emit everything before it
              // and keep it as the new sequence's introducer.
              if (this.carry.length > 1) {
                write(Uint8Array.from(this.carry.slice(0, -1)));
              }
              this.carry = [ESC];
            }
            escIdx = -1;
            this.state = "esc";
            // no i++: reprocess in "esc"
          }
          break;
        }
        case "str": {
          if (b === ESC) {
            escIdx = i;
            this.state = "strEsc";
          }
          i++;
          break;
        }
        case "strEsc":
        case "overflowEsc": {
          const from = this.state === "strEsc" ? "str" : "oscOverflow";
          if (this.carry.length) {
            // The pending ESC was held back at the previous chunk end; now
            // that we know what follows, it is passthrough either way.
            flushCarry();
            spanStart = i;
          }
          if (b === 0x5c /* \ */) {
            this.state = "ground";
            escIdx = -1;
          } else if (b === ESC) {
            escIdx = i; // re-arm: the newest ESC is the terminator candidate
          } else {
            // Not a terminator — even `ESC ]` here stays inside the string:
            // an OSC inside a DCS payload must not start OSC handling.
            this.state = from;
            escIdx = -1;
          }
          i++;
          break;
        }
        case "oscOverflow": {
          if (b === BEL) {
            this.state = "ground";
          } else if (b === ESC) {
            escIdx = i;
            this.state = "overflowEsc";
          }
          i++;
          break;
        }
      }
    }

    // End of chunk: flush the trailing span, stash incomplete sequence bytes.
    switch (this.state) {
      case "ground":
      case "str":
      case "oscOverflow":
        flushSpanTo(n);
        break;
      case "strEsc":
      case "overflowEsc":
        // Hold the trailing ESC back: the next chunk decides whether it is
        // an ST terminator (forward) or plain payload.
        if (escIdx >= 0) {
          flushSpanTo(escIdx);
          this.carry = [ESC];
        } else {
          flushSpanTo(n); // ESC already carried (empty chunk)
        }
        break;
      default: {
        // esc / csi / osc / oscEsc: buffer the in-chunk sequence bytes; the
        // next push decides consume-vs-forward.
        if (seqStart >= 0) flushSpanTo(seqStart);
        for (let j = Math.max(seqStart, 0); j < n; j++) {
          this.carry.push(bytes[j]);
        }
        break;
      }
    }

    if (wrote) {
      for (const cb of [...this.afterWrite]) cb();
    }
  }
}
