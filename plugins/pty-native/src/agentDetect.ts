/**
 * Agent lifecycle detector.
 *
 * An OSC state machine over raw PTY bytes. Transitions come only from OSC
 * sequences (133 prompt boundaries, our 777 hook marker), never raw output, so a
 * TUI agent repainting continuously never flaps working/waiting.
 */
const ESC = 0x1b;
const BEL = 0x07;
const OSC_INTRO = 0x5d; // ]
const ST_FINAL = 0x5c; // backslash
const SEMI = 0x3b; // ;
const OSC_MAX = 2048;
const DEFAULT_AGENTS = ["claude", "codex", "gemini"];
const TERMCO_MARKER = "notify;Termco;";

export type Transition =
  | { type: "started"; agent: string }
  | { type: "working" }
  | { type: "attention" }
  | { type: "finished" }
  | { type: "exited" };

export interface AgentSignal {
  id: number;
  kind: "started" | "working" | "attention" | "finished" | "exited";
  agent: string | null;
}

export function intoSignal(t: Transition, id: number): AgentSignal {
  if (t.type === "started") return { id, kind: "started", agent: t.agent };
  return { id, kind: t.type, agent: null };
}

type State = "ground" | "esc" | "osc" | "oscEsc";
type Status = "working" | "waiting";

const indexOf = (arr: number[], byte: number) => arr.indexOf(byte);
const latin1 = (bytes: number[]) => String.fromCharCode(...bytes);
function utf8(bytes: number[]): string | null {
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(Uint8Array.from(bytes));
  } catch {
    return null;
  }
}
function bytesStartWith(bytes: number[], prefix: string): boolean {
  if (bytes.length < prefix.length) return false;
  for (let i = 0; i < prefix.length; i++) if (bytes[i] !== prefix.charCodeAt(i)) return false;
  return true;
}
function bytesEq(bytes: number[], s: string): boolean {
  return bytes.length === s.length && bytesStartWith(bytes, s);
}

export class AgentDetector {
  private readonly agents: string[];
  private state: State = "ground";
  private osc: number[] = [];
  private armed = false;
  private status: Status = "working";

  constructor(agents: string[] = DEFAULT_AGENTS) {
    this.agents = agents;
  }

  process(input: Uint8Array, emit: (t: Transition) => void): void {
    if (this.state === "ground" && !input.includes(ESC)) return;
    for (const b of input) {
      switch (this.state) {
        case "ground":
          if (b === ESC) this.state = "esc";
          break;
        case "esc":
          if (b === OSC_INTRO) {
            this.state = "osc";
            this.osc = [];
          } else if (b === ESC) {
            /* stay */
          } else {
            this.state = "ground";
          }
          break;
        case "osc":
          if (b === BEL) {
            this.finishOsc(emit);
            this.state = "ground";
          } else if (b === ESC) {
            this.state = "oscEsc";
          } else if (this.osc.length < OSC_MAX) {
            this.osc.push(b);
          } else {
            this.osc = [];
            this.state = "ground";
          }
          break;
        case "oscEsc":
          if (b === ST_FINAL) {
            this.finishOsc(emit);
            this.state = "ground";
          } else if (b === ESC) {
            /* stay */
          } else {
            this.osc = [];
            this.state = "ground";
          }
          break;
      }
    }
  }

  finish(emit: (t: Transition) => void): void {
    if (this.armed) {
      this.disarm();
      emit({ type: "exited" });
    }
  }

  private disarm(): void {
    this.armed = false;
    this.status = "working";
  }

  private finishOsc(emit: (t: Transition) => void): void {
    const body = this.osc;
    this.osc = [];
    const semi = indexOf(body, SEMI);
    const ps = semi < 0 ? body : body.slice(0, semi);
    const pt = semi < 0 ? [] : body.slice(semi + 1);
    const psStr = latin1(ps);
    if (psStr === "133") this.handleOsc133(pt, emit);
    else if (psStr === "9" && !bytesStartWith(pt, "4;") && !bytesEq(pt, "4")) this.genericAttention(emit);
    else if (psStr === "777") this.handleOsc777(pt, emit);
  }

  private handleOsc777(pt: number[], emit: (t: Transition) => void): void {
    if (bytesStartWith(pt, TERMCO_MARKER)) {
      const tail = pt.slice(TERMCO_MARKER.length);
      const semi = indexOf(tail, SEMI);
      let agent: string;
      let eventBytes: number[];
      if (semi >= 0) {
        const name = utf8(tail.slice(0, semi));
        if (name === null || !this.agents.includes(name)) return;
        agent = name;
        eventBytes = tail.slice(semi + 1);
      } else {
        agent = "claude";
        eventBytes = tail;
      }
      const event = latin1(eventBytes);
      if (event === "working") {
        this.ensureArmed(agent, emit);
        this.setWorking(emit);
      } else if (event === "attention") {
        this.ensureArmed(agent, emit);
        this.status = "waiting";
        emit({ type: "attention" });
      } else if (event === "finished") {
        this.ensureArmed(agent, emit);
        this.status = "waiting";
        emit({ type: "finished" });
      }
      return;
    }
    this.genericAttention(emit);
  }

  private handleOsc133(pt: number[], emit: (t: Transition) => void): void {
    const first = pt[0];
    if (first === 0x43 /* C */) {
      if (this.armed) return;
      const cmd = bytesStartWith(pt, "C;") ? pt.slice(2) : [];
      const agent = this.matchAgent(cmd);
      if (agent) {
        this.armed = true;
        this.status = "working";
        emit({ type: "started", agent });
      }
    } else if (first === 0x44 /* D */ && this.armed) {
      this.disarm();
      emit({ type: "exited" });
    }
  }

  private ensureArmed(agent: string, emit: (t: Transition) => void): void {
    if (!this.armed) {
      this.armed = true;
      this.status = "working";
      emit({ type: "started", agent });
    }
  }

  private setWorking(emit: (t: Transition) => void): void {
    if (this.status !== "working") {
      this.status = "working";
      emit({ type: "working" });
    }
  }

  private genericAttention(emit: (t: Transition) => void): void {
    if (this.armed) {
      this.status = "waiting";
      emit({ type: "attention" });
    }
  }

  private matchAgent(cmd: number[]): string | null {
    const str = utf8(cmd);
    if (str === null) return null;
    for (const token of str.split(/\s+/).filter(Boolean)) {
      if (token.startsWith("-")) continue;
      const base = token.split(/[/\\]/).pop() ?? token;
      const agent = this.agents.find((a) => {
        if (!base.startsWith(a)) return false;
        const rest = base.slice(a.length);
        return rest === "" || rest.startsWith("-");
      });
      if (agent) return agent;
    }
    return null;
  }
}
