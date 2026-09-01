import { SessionSeq, type SessionEventExplanation, type TrajectoryRecord } from "@termco/session-base";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Inspector } from "./Inspector";

afterEach(cleanup);

function requestRecord(id: string, seq: number, header: Record<string, unknown>): TrajectoryRecord {
  return {
    id,
    kind: "request",
    sourceSeqs: [SessionSeq(seq)],
    time: { start: seq },
    status: "completed",
    nesting: {},
    summary: `Request ${id}`,
    searchableText: id,
    inspector: { type: "request/header", seq, time: seq, data: { header } } as never,
  };
}

const base = {
  selectedModelId: "old-model",
  providerRoute: "provider",
  providerModelId: "old-model",
  systemPrompt: "Old instructions",
  messages: [],
  tools: [{ name: "read", inputSchema: { type: "object" } }],
  activeTools: ["read"],
  approvalPolicy: { mode: "ask" },
};

describe("Inspector", () => {
  it("shows semantic request changes and navigable causal links", () => {
    const previous = requestRecord("previous", 1, base);
    const current = requestRecord("current", 4, {
      ...base,
      selectedModelId: "new-model",
      tools: [
        { name: "read", inputSchema: { type: "object", required: ["path"] } },
        { name: "write", inputSchema: { type: "object" } },
      ],
    });
    const navigate = vi.fn();
    const causal: SessionEventExplanation = {
      event: { type: "session/title", seq: SessionSeq(4), time: 4, data: { title: "Current", source: "user" } },
      sources: [SessionSeq(1)],
      derived: [SessionSeq(9)],
    };

    render(<Inspector record={current} records={[previous, current]} startTime={0} onCopy={vi.fn()} causal={causal} causalLoading={false} causalError={null} onNavigateSeq={navigate} />);

    expect(screen.getByText("Changes from previous request")).toBeTruthy();
    expect(screen.getByText("old-model")).toBeTruthy();
    expect(screen.getAllByText("new-model").length).toBeGreaterThan(0);
    expect(screen.getByText("Added: write")).toBeTruthy();
    expect(screen.getByText("Schema changed: read")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Open source event 1" }));
    fireEvent.click(screen.getByRole("button", { name: "Open derived event 9" }));
    expect(navigate.mock.calls).toEqual([[1], [9]]);
  });

  it("renders typed tool input, canonical output, timing, and recovery state", () => {
    const call: TrajectoryRecord = {
      id: "call",
      kind: "tool",
      sourceSeqs: [SessionSeq(5)],
      time: { start: 5, end: 8 },
      status: "failed",
      nesting: { callId: "call-1" as never },
      summary: "Read file",
      searchableText: "read",
      inspector: { type: "tool/call", data: { name: "read", parsedInput: { path: "README.md" }, concurrency: "safe" } },
    };
    const result: TrajectoryRecord = {
      ...call,
      id: "result",
      sourceSeqs: [SessionSeq(8)],
      inspector: { type: "tool/result", data: { callId: "call-1", canonicalOutput: { ok: false }, modelContent: { text: "failed" }, recovered: "outcome-unknown", timing: { startedAt: 5, endedAt: 8 }, error: { name: "Error", code: "ENOENT", message: "Missing" } } },
    };

    render(<Inspector record={call} records={[call, result]} startTime={0} onCopy={vi.fn()} causal={null} causalLoading={false} causalError={null} onNavigateSeq={vi.fn()} />);

    expect(screen.getByText("Tool input")).toBeTruthy();
    expect(screen.getByText("Canonical output")).toBeTruthy();
    expect(screen.getByText("Outcome unknown after recovery")).toBeTruthy();
    expect(screen.getByText("ENOENT · Missing")).toBeTruthy();
  });
});
