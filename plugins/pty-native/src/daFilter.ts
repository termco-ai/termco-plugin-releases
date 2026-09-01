/**
 * Device-Attributes / cursor-position filter.
 *
 * Intercepts DA1/DA2 (ESC[…c) and the startup DSR-CPR (ESC[6n) queries in the
 * shell's *output* stream and answers them directly by writing back into the
 * pty, so programs (notably pwsh/PSReadLine) don't block waiting on a reply the
 * renderer can't deliver synchronously. Query bytes are swallowed, not forwarded.
 */
const ESC = 0x1b;
const LBRACKET = 0x5b;
const FINAL_C = 0x63;
const FINAL_N = 0x6e;
const PREFIX_GT = 0x3e;
const PREFIX_EQ = 0x3d;

export const DA1_REPLY = Uint8Array.from([0x1b, 0x5b, 0x3f, 0x31, 0x3b, 0x32, 0x63]); // ESC[?1;2c
export const DA2_REPLY = Uint8Array.from(
  [0x1b, 0x5b, 0x3e, 0x30, 0x3b, 0x32, 0x37, 0x36, 0x3b, 0x30, 0x63], // ESC[>0;276;0c
);
export const DSR_CPR_REPLY = Uint8Array.from([0x1b, 0x5b, 0x31, 0x3b, 0x31, 0x52]); // ESC[1;1R

const HOLD_MAX = 256;

type State = "idle" | "afterEsc" | "insideCsi";

export class DaFilter {
  private state: State = "idle";
  private hold: number[] = [];
  private cprReplied = false;
  private sawOutput = false;

  /**
   * @param input   raw bytes from the pty
   * @param out     filtered bytes to forward to the renderer (pushed onto)
   * @param respond called with reply bytes to write back into the pty
   */
  process(
    input: Uint8Array,
    out: number[],
    respond: (reply: Uint8Array) => void,
  ): void {
    if (this.state === "idle" && !input.includes(ESC)) {
      for (const b of input) out.push(b);
      if (input.length > 0) this.sawOutput = true;
      return;
    }

    for (const b of input) {
      switch (this.state) {
        case "idle":
          if (b === ESC) {
            this.state = "afterEsc";
            this.hold = [b];
          } else {
            out.push(b);
          }
          break;
        case "afterEsc":
          if (b === LBRACKET) {
            this.state = "insideCsi";
            this.hold.push(b);
          } else if (b === ESC) {
            for (const h of this.hold) out.push(h);
            this.hold = [b];
          } else {
            for (const h of this.hold) out.push(h);
            out.push(b);
            this.hold = [];
            this.state = "idle";
          }
          break;
        case "insideCsi": {
          this.hold.push(b);
          if (b >= 0x40 && b <= 0x7e) {
            if (b === FINAL_C) {
              const middle = this.hold.slice(2, this.hold.length - 1);
              const isResponse =
                middle.includes(0x3f /* ? */) || middle.includes(0x3b /* ; */);
              const prefix = middle.length > 0 ? middle[0] : 0;
              if (isResponse) {
                for (const h of this.hold) out.push(h);
              } else if (prefix === PREFIX_GT) {
                respond(DA2_REPLY);
              } else if (prefix === PREFIX_EQ) {
                // swallow, no reply
              } else if (prefix === 0 || (prefix >= 0x30 && prefix <= 0x39)) {
                respond(DA1_REPLY);
              } else {
                for (const h of this.hold) out.push(h);
              }
            } else if (
              b === FINAL_N &&
              this.hold.length === 4 &&
              this.hold[2] === 0x36 /* '6' */ &&
              !this.cprReplied &&
              !this.sawOutput &&
              out.length === 0
            ) {
              respond(DSR_CPR_REPLY);
              this.cprReplied = true;
            } else {
              for (const h of this.hold) out.push(h);
            }
            this.hold = [];
            this.state = "idle";
          } else if (this.hold.length >= HOLD_MAX) {
            for (const h of this.hold) out.push(h);
            this.hold = [];
            this.state = "idle";
          }
          break;
        }
      }
    }
    if (out.length > 0) this.sawOutput = true;
  }
}
