/**
 * Agent-detect behavior tests (signal mapping + detector state machine).
 */
import { describe, expect, it } from "vitest";
import { AgentDetector, intoSignal, type Transition } from "./agentDetect";

const ESC = 0x1b;
const BEL = 0x07;
const OSC_INTRO = 0x5d;
const ST_FINAL = 0x5c;

function osc(body: string): Uint8Array {
  return Uint8Array.from([ESC, OSC_INTRO, ...Buffer.from(body), ESC, ST_FINAL]);
}
function run(d: AgentDetector, input: Uint8Array): Transition[] {
  const out: Transition[] = [];
  d.process(input, (t) => out.push(t));
  return out;
}
const started = (agent: string): Transition => ({ type: "started", agent });

describe("intoSignal", () => {
  it("started_signal_carries_agent_name_and_id", () => {
    expect(intoSignal({ type: "started", agent: "claude" }, 7)).toEqual({
      id: 7,
      kind: "started",
      agent: "claude",
    });
  });
  it("lifecycle_signals_map_to_stable_kind_strings", () => {
    for (const kind of ["working", "attention", "finished", "exited"] as const) {
      const s = intoSignal({ type: kind }, 1);
      expect(s.kind).toBe(kind);
      expect(s.agent).toBeNull();
    }
  });
});

describe("AgentDetector", () => {
  it("arms_on_agent_command", () => {
    expect(run(new AgentDetector(), osc("133;C;claude -p hello"))).toEqual([started("claude")]);
  });

  it("arms_on_pathed_and_wrapped_command", () => {
    expect(run(new AgentDetector(), osc("133;C;/usr/local/bin/codex exec"))).toEqual([started("codex")]);
    expect(run(new AgentDetector(), osc("133;C;npx claude"))).toEqual([started("claude")]);
  });

  it("arms_on_dash_suffixed_alias", () => {
    expect(run(new AgentDetector(), osc("133;C;claude-enigma"))).toEqual([started("claude")]);
  });

  it("does_not_arm_on_other_commands", () => {
    const d = new AgentDetector();
    expect(run(d, osc("133;C;vim src/main.rs"))).toEqual([]);
    expect(run(d, osc("133;C;cat claude.txt"))).toEqual([]);
    expect(run(d, osc("133;C;claudexyz"))).toEqual([]);
  });

  it("ignores_bell_and_plain_output", () => {
    const d = new AgentDetector();
    run(d, osc("133;C;claude"));
    expect(run(d, Uint8Array.from([BEL]))).toEqual([]);
    expect(run(d, new TextEncoder().encode("thinking...\x07more"))).toEqual([]);
  });

  it("termco_marker_drives_status", () => {
    const d = new AgentDetector();
    run(d, osc("133;C;claude"));
    expect(run(d, osc("777;notify;Termco;attention"))).toEqual([{ type: "attention" }]);
    expect(run(d, osc("777;notify;Termco;working"))).toEqual([{ type: "working" }]);
    expect(run(d, osc("777;notify;Termco;working"))).toEqual([]);
    expect(run(d, osc("777;notify;Termco;finished"))).toEqual([{ type: "finished" }]);
  });

  it("termco_marker_auto_arms_without_preexec", () => {
    expect(run(new AgentDetector(), osc("777;notify;Termco;attention"))).toEqual([
      started("claude"),
      { type: "attention" },
    ]);
  });

  it("four_field_marker_self_arms_named_agent", () => {
    expect(run(new AgentDetector(), osc("777;notify;Termco;codex;working"))).toEqual([started("codex")]);
    expect(run(new AgentDetector(), osc("777;notify;Termco;gemini;finished"))).toEqual([
      started("gemini"),
      { type: "finished" },
    ]);
  });

  it("four_field_marker_ignores_unknown_agent", () => {
    const d = new AgentDetector();
    expect(run(d, osc("777;notify;Termco;evil;attention"))).toEqual([]);
    expect(run(d, osc("777;notify;Termco;codex;attention"))).toEqual([
      started("codex"),
      { type: "attention" },
    ]);
  });

  it("four_field_marker_drives_status_after_preexec", () => {
    const d = new AgentDetector();
    run(d, osc("133;C;gemini"));
    expect(run(d, osc("777;notify;Termco;gemini;attention"))).toEqual([{ type: "attention" }]);
    expect(run(d, osc("777;notify;Termco;gemini;working"))).toEqual([{ type: "working" }]);
    expect(run(d, osc("777;notify;Termco;gemini;finished"))).toEqual([{ type: "finished" }]);
  });

  it("generic_osc777_and_osc9_attention_only_when_armed", () => {
    const d = new AgentDetector();
    expect(run(d, osc("777;notify;Other;ready"))).toEqual([]);
    run(d, osc("133;C;codex"));
    expect(run(d, osc("777;notify;Codex;ready"))).toEqual([{ type: "attention" }]);
    expect(run(d, osc("9;needs you"))).toEqual([{ type: "attention" }]);
    expect(run(d, osc("9;4;1;50"))).toEqual([]);
  });

  it("exits_on_133d", () => {
    const d = new AgentDetector();
    run(d, osc("133;C;claude"));
    expect(run(d, osc("133;D;0"))).toEqual([{ type: "exited" }]);
    expect(run(d, osc("133;D;0"))).toEqual([]);
  });

  it("bel_terminator_inside_osc_is_not_attention", () => {
    const d = new AgentDetector();
    run(d, osc("133;C;claude"));
    const seq = Uint8Array.from([ESC, OSC_INTRO, ...Buffer.from("0;set title"), BEL]);
    expect(run(d, seq)).toEqual([]);
  });

  it("started_split_across_chunks", () => {
    const d = new AgentDetector();
    expect(run(d, Uint8Array.from([ESC, OSC_INTRO]))).toEqual([]);
    expect(run(d, new TextEncoder().encode("133;C;cla"))).toEqual([]);
    const out = run(d, new TextEncoder().encode("ude"));
    out.push(...run(d, Uint8Array.from([ESC, ST_FINAL])));
    expect(out).toEqual([started("claude")]);
  });

  it("finish_reports_exited_when_armed", () => {
    const d = new AgentDetector();
    run(d, osc("133;C;claude"));
    const out: Transition[] = [];
    d.finish((t) => out.push(t));
    expect(out).toEqual([{ type: "exited" }]);
    const out2: Transition[] = [];
    d.finish((t) => out2.push(t));
    expect(out2).toEqual([]);
  });

  it("oversized_osc_does_not_panic", () => {
    const d = new AgentDetector();
    run(d, osc("133;C;claude"));
    const seq = Uint8Array.from([ESC, OSC_INTRO, ...Buffer.alloc(OSC_MAX_PLUS(), 0x78), ESC, ST_FINAL]);
    expect(run(d, seq)).toEqual([]);
    expect(run(d, osc("777;notify;Termco;attention"))).toEqual([{ type: "attention" }]);
  });
});

function OSC_MAX_PLUS(): number {
  return 2048 + 100;
}
