import { SessionSeq, type TrajectoryRecord } from "@termco/session-base";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { TrajectoryLedger } from "./TrajectoryLedger";

const scrollToIndex = vi.hoisted(() => vi.fn());

vi.mock("@tanstack/react-virtual", () => ({
  useVirtualizer: ({ count }: { count: number }) => ({
    getTotalSize: () => count * 48,
    getVirtualItems: () => Array.from({ length: count }, (_, index) => ({ index, key: index, size: 48, start: index * 48 })),
    scrollToIndex,
  }),
}));

afterEach(cleanup);

function record(id: string, seq: number): TrajectoryRecord {
  return {
    id,
    kind: "request",
    sourceSeqs: [SessionSeq(seq)],
    time: { start: seq },
    status: "completed",
    nesting: {},
    summary: `Request ${seq}`,
    searchableText: `Request ${seq}`,
    inspector: {},
  };
}

describe("TrajectoryLedger accessibility and responsive structure", () => {
  it("exposes virtualized rows as selectable options and collapses secondary columns on narrow layouts", () => {
    render(<TrajectoryLedger records={[record("one", 1), record("two", 2)]} selectedId="two" highlightedEventSeq={null} onSelect={vi.fn()} actions={[]} />);

    expect(screen.getByRole("listbox", { name: "Trajectory records" })).toBeTruthy();
    const options = screen.getAllByRole("option");
    expect(options.map((option) => option.getAttribute("aria-selected"))).toEqual(["false", "true"]);
    expect(options[0]?.getAttribute("aria-setsize")).toBe("2");
    expect(options[0]?.className).toContain("sm:grid-cols-");
    expect(options[0]?.querySelectorAll(".hidden.sm\\:block").length).toBe(2);
  });

  it("follows the current tail, suspends on upward inspection, and jumps back without remounting rows", () => {
    const input = [record("one", 1), record("two", 2)];
    render(<TrajectoryLedger records={input} selectedId={null} highlightedEventSeq={null} onSelect={vi.fn()} actions={[]} />);
    const ledger = screen.getByRole("listbox", { name: "Trajectory records" });
    expect(scrollToIndex).toHaveBeenCalledWith(1, { align: "end" });

    Object.defineProperties(ledger, {
      scrollHeight: { configurable: true, value: 1_000 },
      clientHeight: { configurable: true, value: 200 },
      scrollTop: { configurable: true, value: 100 },
    });
    fireEvent.scroll(ledger);
    expect(ledger.getAttribute("data-follow-live")).toBe("false");
    fireEvent.click(screen.getByRole("button", { name: "Jump to live trajectory tail" }));
    expect(ledger.getAttribute("data-follow-live")).toBe("true");
    expect(scrollToIndex).toHaveBeenLastCalledWith(1, { align: "end" });
  });
});
