import type { TrajectoryRecord } from "@termco/session-base";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { TimingOverview } from "./TimingOverview";

const records: readonly TrajectoryRecord[] = [
  {
    id: "request",
    kind: "request",
    sourceSeqs: [1 as never, 2 as never],
    time: { start: 100, end: 200 },
    status: "completed",
    nesting: { requestId: "req-1" as never },
    summary: "gpt-5.6-sol",
    searchableText: "request",
    inspector: { type: "request/header", data: { requestId: "req-1" } },
  },
  {
    id: "approval",
    kind: "approval",
    sourceSeqs: [3 as never],
    time: { start: 220 },
    status: "running",
    nesting: { callId: "call-1" as never },
    summary: "Approval",
    searchableText: "approval",
    inspector: { type: "approval/request", data: { approvalId: "approval-1" } },
  },
];

afterEach(cleanup);

describe("TimingOverview", () => {
  it("shows measured lanes, preserves unknown live duration, and selects a record", () => {
    const onSelectRecords = vi.fn();
    render(<TimingOverview records={records} hasEarlier={false} onLoadEarlier={vi.fn()} onSelectRecords={onSelectRecords} />);

    expect(screen.getByRole("region", { name: "Trajectory timing overview" })).toBeTruthy();
    expect(screen.getByLabelText(/gpt-5\.6-sol.*100ms/)).toBeTruthy();
    expect(screen.getByLabelText(/Approval.*in progress.*duration unknown/)).toBeTruthy();
    fireEvent.click(screen.getByLabelText(/gpt-5\.6-sol.*100ms/));
    expect(onSelectRecords).toHaveBeenCalledWith(["request"]);
  });

  it("loads an omitted prefix and exposes deterministic zoom, pan reset, and scale controls", () => {
    const onLoadEarlier = vi.fn();
    render(<TimingOverview records={records} hasEarlier onLoadEarlier={onLoadEarlier} onSelectRecords={vi.fn()} />);

    fireEvent.click(screen.getByRole("button", { name: "Load earlier timing records" }));
    expect(onLoadEarlier).toHaveBeenCalledTimes(1);

    const overview = screen.getByRole("region", { name: "Trajectory timing overview" });
    expect(overview.getAttribute("data-scale")).toBe("actual");
    fireEvent.click(screen.getByRole("button", { name: "Use equal-width timing scale" }));
    expect(overview.getAttribute("data-scale")).toBe("equal");

    fireEvent.click(screen.getByRole("button", { name: "Zoom timing overview in" }));
    expect(overview.getAttribute("data-zoom")).toBe("2");
    fireEvent.click(screen.getByRole("button", { name: "Reset timing overview" }));
    expect(overview.getAttribute("data-zoom")).toBe("1");
  });
});
