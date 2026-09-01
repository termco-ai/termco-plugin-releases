// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import type { AgentMeta } from "../store/chatStore";
import { useChatStore } from "../store/chatStore";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AgentStatusPill } from "./AgentStatusPill";

vi.mock("../runtime/platform", () => import("../runtime/platformTestMock"));

function meta(patch: Partial<AgentMeta>): AgentMeta {
  return {
    status: "idle",
    step: null,
    approvalsPending: 0,
    error: null,
    tokens: { inputTokens: 0, outputTokens: 0, cachedInputTokens: 0 },
    lastInputTokens: 0,
    lastCachedTokens: 0,
    lastTokensPerSecond: 0,
    timeToFirstOutputMs: 0,
    hitStepCap: false,
    compacting: null,
    compactionNotice: null,
    ...patch,
  };
}

function setMeta(patch: Partial<AgentMeta>) {
  useChatStore.setState({ agentMeta: meta(patch) });
}

afterEach(() => {
  cleanup();
  setMeta({});
});

describe("AgentStatusPill", () => {
  it("renders nothing while idle without error", () => {
    setMeta({ status: "idle" });
    const { container } = render(<AgentStatusPill onClick={() => {}} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("renders nothing while awaiting approval", () => {
    setMeta({ status: "awaiting-approval", error: "boom" });
    const { container } = render(<AgentStatusPill onClick={() => {}} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("shows the step label with a spinner while thinking", () => {
    setMeta({ status: "thinking", step: "Reading files" });
    render(<AgentStatusPill onClick={() => {}} />);
    expect(screen.getByText("Reading files")).toBeInTheDocument();
    expect(screen.getByRole("status")).toBeInTheDocument();
  });

  it("falls back to a generic label while streaming without a step", () => {
    setMeta({ status: "streaming", step: null });
    render(<AgentStatusPill onClick={() => {}} />);
    expect(screen.getByText("Thinking…")).toBeInTheDocument();
  });

  it("shows the error message in the destructive tone on error", () => {
    setMeta({ status: "error", error: "Request failed" });
    render(<AgentStatusPill onClick={() => {}} />);
    const btn = screen.getByRole("button");
    expect(btn).toHaveTextContent("Request failed");
    expect(btn.className).toContain("destructive");
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("shows the error presentation when idle with a lingering error", () => {
    setMeta({ status: "idle", error: "boom" });
    render(<AgentStatusPill onClick={() => {}} />);
    const btn = screen.getByRole("button");
    expect(btn).toHaveTextContent("boom");
    expect(btn.className).toContain("destructive");
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("falls back to a generic error label when no message is set", () => {
    setMeta({ status: "error", error: null });
    render(<AgentStatusPill onClick={() => {}} />);
    expect(screen.getByRole("button")).toHaveTextContent("Error");
  });

  it("invokes onClick when pressed", () => {
    setMeta({ status: "streaming", step: "Working" });
    const onClick = vi.fn();
    render(<AgentStatusPill onClick={onClick} />);
    fireEvent.click(screen.getByRole("button"));
    expect(onClick).toHaveBeenCalledTimes(1);
  });
});
