/**
 * DaFilter behavior tests: DA1/DA2 and DSR-CPR interception, chunk-boundary
 * splits, and passthrough of everything else.
 */
import { describe, expect, it } from "vitest";
import { DA1_REPLY, DA2_REPLY, DaFilter, DSR_CPR_REPLY } from "./daFilter";

const HOLD_MAX = 256;

const b = (s: string): number[] => Array.from(new TextEncoder().encode(s));
const da1 = Array.from(DA1_REPLY);
const da2 = Array.from(DA2_REPLY);
const cpr = Array.from(DSR_CPR_REPLY);

function run(
  f: DaFilter,
  input: number[],
): { out: number[]; replies: number[][] } {
  const out: number[] = [];
  const replies: number[][] = [];
  f.process(Uint8Array.from(input), out, (r) => replies.push(Array.from(r)));
  return { out, replies };
}

describe("DaFilter", () => {
  it("da1_bare", () => {
    const { out, replies } = run(new DaFilter(), b("\x1b[c"));
    expect(out).toEqual([]);
    expect(replies).toEqual([da1]);
  });

  it("da1_with_zero_param", () => {
    const { out, replies } = run(new DaFilter(), b("\x1b[0c"));
    expect(out).toEqual([]);
    expect(replies).toEqual([da1]);
  });

  it("da2_secondary", () => {
    const { out, replies } = run(new DaFilter(), b("\x1b[>c"));
    expect(out).toEqual([]);
    expect(replies).toEqual([da2]);
  });

  it("da3_consumed_silently", () => {
    const { out, replies } = run(new DaFilter(), b("\x1b[=c"));
    expect(out).toEqual([]);
    expect(replies).toEqual([]);
  });

  it("plain_text_passes_through", () => {
    const { out, replies } = run(new DaFilter(), b("hello world\n"));
    expect(out).toEqual(b("hello world\n"));
    expect(replies).toEqual([]);
  });

  it("embedded_da_preserves_surrounding", () => {
    const { out, replies } = run(new DaFilter(), b("pre\x1b[0cpost"));
    expect(out).toEqual(b("prepost"));
    expect(replies).toEqual([da1]);
  });

  it("non_da_csi_passes_through", () => {
    const { out, replies } = run(new DaFilter(), b("\x1b[?2004h"));
    expect(out).toEqual(b("\x1b[?2004h"));
    expect(replies).toEqual([]);
  });

  it("split_across_chunks", () => {
    const f = new DaFilter();
    const r1 = run(f, b("\x1b"));
    const r2 = run(f, b("["));
    const r3 = run(f, b("c"));
    expect(r1.out).toEqual([]);
    expect(r2.out).toEqual([]);
    expect(r3.out).toEqual([]);
    expect(r1.replies).toEqual([]);
    expect(r2.replies).toEqual([]);
    expect(r3.replies).toEqual([da1]);
  });

  it("escape_then_non_csi", () => {
    const { out, replies } = run(new DaFilter(), b("\x1bM"));
    expect(out).toEqual(b("\x1bM"));
    expect(replies).toEqual([]);
  });

  it("double_esc", () => {
    const { out, replies } = run(new DaFilter(), b("\x1b\x1b[c"));
    expect(out).toEqual(b("\x1b"));
    expect(replies).toEqual([da1]);
  });

  it("da1_response_passes_through_no_loop", () => {
    const { out, replies } = run(new DaFilter(), b("\x1b[?1;2c"));
    expect(out).toEqual(b("\x1b[?1;2c"));
    expect(replies).toEqual([]);
  });

  it("da2_response_passes_through_no_loop", () => {
    const { out, replies } = run(new DaFilter(), b("\x1b[>0;276;0c"));
    expect(out).toEqual(b("\x1b[>0;276;0c"));
    expect(replies).toEqual([]);
  });

  it("da_with_question_prefix_is_response", () => {
    const { out, replies } = run(new DaFilter(), b("\x1b[?6c"));
    expect(out).toEqual(b("\x1b[?6c"));
    expect(replies).toEqual([]);
  });

  it("runaway_csi_flushes_at_hold_max", () => {
    const f = new DaFilter();
    const input = [...b("\x1b["), ...Array(HOLD_MAX).fill(0x30 /* '0' */)];
    const { out, replies } = run(f, input);
    expect(out.length).toBe(HOLD_MAX + 2);
    expect(replies).toEqual([]);
  });

  it("cpr_startup_answered_and_swallowed", () => {
    const { out, replies } = run(new DaFilter(), b("\x1b[6n"));
    expect(out).toEqual([]);
    expect(replies).toEqual([cpr]);
  });

  it("cpr_answered_only_once", () => {
    const f = new DaFilter();
    const r1 = run(f, b("\x1b[6n"));
    expect(r1.replies).toEqual([cpr]);
    const r2 = run(f, b("\x1b[6n"));
    expect(r2.out).toEqual(b("\x1b[6n"));
    expect(r2.replies).toEqual([]);
  });

  it("cpr_passes_through_after_output", () => {
    const f = new DaFilter();
    const o1 = run(f, b("PS C:\\> "));
    expect(o1.out).toEqual(b("PS C:\\> "));
    const { out, replies } = run(f, b("\x1b[6n"));
    expect(out).toEqual(b("\x1b[6n"));
    expect(replies).toEqual([]);
  });

  it("cpr_passes_through_when_output_precedes_in_same_chunk", () => {
    const { out, replies } = run(new DaFilter(), b("hi\x1b[6n"));
    expect(out).toEqual(b("hi\x1b[6n"));
    expect(replies).toEqual([]);
  });

  it("cpr_answered_when_split_across_reads", () => {
    const f = new DaFilter();
    const r1 = run(f, b("\x1b[6"));
    expect(r1.out).toEqual([]);
    expect(r1.replies).toEqual([]);
    const r2 = run(f, b("n"));
    expect(r2.out).toEqual([]);
    expect(r2.replies).toEqual([cpr]);
  });

  it("other_dsr_passes_through", () => {
    const { out, replies } = run(new DaFilter(), b("\x1b[5n"));
    expect(out).toEqual(b("\x1b[5n"));
    expect(replies).toEqual([]);
  });

  it("da_still_answered_with_cpr_logic", () => {
    const { out, replies } = run(new DaFilter(), b("\x1b[c"));
    expect(out).toEqual([]);
    expect(replies).toEqual([da1]);
  });
});
