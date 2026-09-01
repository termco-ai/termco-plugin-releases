// @vitest-environment jsdom
// Source-owned by the coding-agent-native plugin.
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { UIMessage } from "ai";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const client = vi.hoisted(() => ({
  startRun: vi.fn(() => Promise.resolve()),
  sendAgentInput: vi.fn(() => Promise.resolve({ ok: true })),
  abortAgentRun: vi.fn(() => Promise.resolve({ ok: true })),
  endAgentRun: vi.fn(() => Promise.resolve({ ok: true })),
  listRuns: vi.fn(() => Promise.resolve([])),
  resubscribeRun: vi.fn(() => Promise.resolve({ ok: true })),
  approveAgentTool: vi.fn(() => Promise.resolve({ ok: true })),
  listSessions: vi.fn(() => Promise.resolve([])),
  listSlashCommands: vi.fn(() => Promise.resolve([])),
  searchSessions: vi.fn(() => Promise.resolve([])),
  listAllSessions: vi.fn(() =>
    Promise.resolve([
      {
        sessionId: "cc-9",
        backend: "claude",
        projectSlug: "-repo",
        name: "Old refactor",
        cwd: "/repo",
        projectName: "repo",
        updatedAt: 1,
        messageCount: 7,
      },
    ]),
  ),
  loadSessionEvents: vi.fn(() =>
    Promise.resolve([{ type: "text", text: "history body" }]),
  ),
  listBackends: vi.fn(() =>
    Promise.resolve([
      {
        backend: "claude",
        label: "Claude Code",
        bin: "claude",
        available: true,
      },
      { backend: "codex", label: "Codex", bin: "codex", available: false },
    ]),
  ),
}));
vi.mock("../lib/client", () => client);

const pluginRuntime = vi.hoisted(() => ({
  events: { subscribe: vi.fn(() => () => {}) },
  trace: { search: vi.fn(() => Promise.resolve([])) },
  trajectory: null,
}));
vi.mock("../runtime", () => ({
  codingAgentUiRuntime: () => pluginRuntime,
}));

// Stub the transcript renderer so the panel test focuses on navigation + roster.
vi.mock("./MessageView", () => ({
  RenderedMessage: ({ message }: { message: UIMessage }) => (
    <div data-testid="msg">
      {(message.parts[0] as { text?: string })?.text ?? ""}
    </div>
  ),
  MessageActionBar: () => null,
  messagePlainText: () => "",
}));

import { useCodingAgentsStore } from "../store/codingAgentsStore";
import { CodingAgentsPanel } from "./CodingAgentsPanel";

const RUNTIME = {
  activeRigId: "rig-A",
  activeRigName: "local",
  cwd: "/repo",
  workspace: { kind: "local" as const },
  openTerminal: vi.fn(() => Promise.resolve()),
};

function reset() {
  useCodingAgentsStore.setState({ runs: {}, activeRunId: null });
  vi.clearAllMocks();
}
beforeEach(reset);
afterEach(() => {
  cleanup();
  reset();
});

function seedRun(status: "idle" | "running" = "idle") {
  const runId = "r1";
  useCodingAgentsStore.setState({
    runs: {
      [runId]: {
        runId,
        seq: 1,
        messages: [
          {
            id: "m1",
            role: "assistant",
            parts: [{ type: "text", text: "hello" }],
          } as UIMessage,
        ],
        status,
        sessionId: "s1",
        model: "opus",
        cwd: "/repo/app",
        usage: null,
        costUsd: null,
        pendingApprovalId: null,
        error: null,
        backend: "claude",
        title: "Fix the bug",
        permissionMode: "default",
        workspace: { kind: "local" },
        createdAt: performance.now(),
      },
    },
    activeRunId: runId,
  });
  return runId;
}

describe("CodingAgentsPanel", () => {
  it("shows the empty state with no runs and opens the form from it", async () => {
    client.listAllSessions.mockResolvedValueOnce([]); // no history for this agent
    render(
      <CodingAgentsPanel runtime={RUNTIME} />,
    );
    expect(await screen.findByText("Run Claude Code")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Start Claude Code/ }));
    expect(screen.getByText("New coding agent")).toBeInTheDocument();
  });

  it("lists a run in the roster and opens its transcript on click", () => {
    seedRun();
    render(
      <CodingAgentsPanel runtime={RUNTIME} />,
    );
    // Roster first: title + backend meta + status badge.
    expect(screen.getByText("Fix the bug")).toBeInTheDocument();
    expect(screen.getByText("Ready")).toBeInTheDocument();
    // Open detail.
    fireEvent.click(screen.getByText("Fix the bug"));
    expect(screen.getByTestId("msg")).toHaveTextContent("hello");
  });

  it("sends a follow-up from the detail composer when idle", () => {
    const runId = seedRun();
    render(
      <CodingAgentsPanel runtime={RUNTIME} />,
    );
    fireEvent.click(screen.getByText("Fix the bug"));
    const box = screen.getByPlaceholderText("Send a follow-up…");
    fireEvent.change(box, { target: { value: "keep going" } });
    fireEvent.keyDown(box, { key: "Enter" });
    expect(client.sendAgentInput).toHaveBeenCalledWith(
      runId,
      "keep going",
      expect.objectContaining({ permissionMode: expect.anything() }),
    );
  });

  it("shows a Stop control and live activity while the agent is working", () => {
    seedRun("running");
    render(
      <CodingAgentsPanel runtime={RUNTIME} />,
    );
    // Working badge appears in the roster.
    expect(screen.getAllByText("Working").length).toBeGreaterThan(0);
    fireEvent.click(screen.getByText("Fix the bug"));
    expect(screen.getByRole("button", { name: /Stop/ })).toBeInTheDocument();
  });

  it("Esc stops a running agent from the detail view", () => {
    seedRun("running");
    render(
      <CodingAgentsPanel runtime={RUNTIME} />,
    );
    fireEvent.click(screen.getByText("Fix the bug"));
    fireEvent.keyDown(window, { key: "Escape" });
    expect(client.abortAgentRun).toHaveBeenCalledWith("r1");
  });

  it("dispatches an open-terminal event with cwd + workspace", () => {
    seedRun();
    render(<CodingAgentsPanel runtime={RUNTIME} />);

    fireEvent.click(screen.getByText("Fix the bug"));
    expect(
      screen.queryByRole("button", { name: "Open terminal" }),
    ).not.toBeInTheDocument();
    fireEvent.pointerDown(screen.getByRole("button", { name: "Run actions" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "Open terminal" }));

    expect(RUNTIME.openTerminal).toHaveBeenCalledWith("/repo/app", {
      kind: "local",
    });
  });

  it("uses a stable event name", () => {
    const dispatchEvent = vi.spyOn(window, "dispatchEvent");
    seedRun();
    render(<CodingAgentsPanel runtime={RUNTIME} />);

    fireEvent.click(screen.getByText("Fix the bug"));
    fireEvent.pointerDown(screen.getByRole("button", { name: "Run actions" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "Open terminal" }));

    expect(RUNTIME.openTerminal).toHaveBeenCalledTimes(1);
    expect(dispatchEvent).not.toHaveBeenCalled();
    dispatchEvent.mockRestore();
  });

  it("preloads history inline and opens a saved session read-only", async () => {
    render(
      <CodingAgentsPanel runtime={RUNTIME} />,
    );
    // History is preloaded into the roster (no separate screen to open).
    const row = await screen.findByText("Old refactor");
    fireEvent.click(row);
    // Opening it folds the transcript into a read-only detail view.
    expect(await screen.findByTestId("msg")).toHaveTextContent("history body");
  });

  it("disables an unavailable backend in the new-agent form", async () => {
    render(
      <CodingAgentsPanel runtime={RUNTIME} />,
    );
    fireEvent.click(screen.getByRole("button", { name: /^New$/ }));
    const codex = await screen.findByTitle(/Codex CLI was not found locally/);
    expect(codex).toBeDisabled();
  });

  it("resumes an old session when you send from a history detail", async () => {
    render(
      <CodingAgentsPanel runtime={RUNTIME} />,
    );
    fireEvent.click(await screen.findByText("Old refactor"));
    // Read-only history detail exposes a "Continue this session…" composer.
    const box = await screen.findByPlaceholderText("Continue this session…");
    fireEvent.change(box, { target: { value: "now fix the tests" } });
    fireEvent.keyDown(box, { key: "Enter" });
    // Resume spawns a live run via startRun with resumeSessionId set.
    expect(client.startRun).toHaveBeenCalledWith(
      expect.objectContaining({
        backend: "claude",
        prompt: "now fix the tests",
        resumeSessionId: "cc-9",
      }),
      expect.any(Function),
    );
  });

  it("rig-scopes the roster: active-rig runs lead, other rigs are set apart", async () => {
    client.listAllSessions.mockResolvedValue([]);
    const baseRun = (id: string, title: string, rigId: string) => ({
      runId: id,
      seq: 1,
      messages: [] as UIMessage[],
      status: "idle" as const,
      sessionId: id,
      model: "opus",
      cwd: "/repo",
      usage: null,
      costUsd: null,
      pendingApprovalId: null,
      error: null,
      backend: "claude" as const,
      title,
      permissionMode: "default" as const,
      createdAt: 1,
      rigId,
    });
    useCodingAgentsStore.setState({
      runs: {
        here: baseRun("here", "Runs here", "rig-A"),
        elsewhere: baseRun("elsewhere", "Runs elsewhere", "rig-B"),
      },
      activeRunId: null,
    });
    render(
      <CodingAgentsPanel runtime={RUNTIME} />,
    );
    // The other-rig run is under a clearly-labeled section, not hidden.
    expect(await screen.findByText(/Other rigs · 1/)).toBeInTheDocument();
    expect(screen.getByText("Runs here")).toBeInTheDocument();
    expect(screen.getByText("Runs elsewhere")).toBeInTheDocument();
  });
});
