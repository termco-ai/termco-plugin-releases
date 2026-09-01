// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { act, cleanup, render, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const {
  chatState,
  getOrCreateChatMock,
  persistMock,
  readFileMock,
  respondApprovalMock,
} = vi.hoisted(() => ({
  chatState: {
    status: "ready" as string,
    messages: [] as unknown[],
    addToolApprovalResponse: vi.fn(),
  },
  getOrCreateChatMock: vi.fn(() => ({})),
  persistMock: vi.fn(),
  readFileMock: vi.fn(),
  respondApprovalMock: vi.fn(async (_input: unknown, publish: () => unknown) => publish()),
}));

vi.mock("../../../chatRuntime", () => ({
  respondToOwnedApproval: respondApprovalMock,
}));

vi.mock("@ai-sdk/react", () => ({
  useChat: () => ({
    status: chatState.status,
    messages: chatState.messages,
    addToolApprovalResponse: chatState.addToolApprovalResponse,
  }),
}));

vi.mock("../../store/chatRuntime", () => ({
  getOrCreateChat: getOrCreateChatMock,
}));

vi.mock("../../store/chatStore", async () => {
  const { create } = await import("zustand");
  type MockState = {
    activeSessionId: string | null;
    agentMeta: Record<string, unknown>;
    mini: { open: boolean };
    live: { getCwd: () => string | null };
    approvalResponder: ((id: string, approved: boolean) => void) | null;
    patchAgentMeta: (p: Record<string, unknown>) => void;
    openMini: () => void;
    persistMessages: (id: string, m: unknown[]) => void;
    setApprovalResponder: (
      fn: ((id: string, approved: boolean) => void) | null,
    ) => void;
  };
  const useChatStore = create<MockState>((set) => ({
    activeSessionId: "s1",
    agentMeta: { status: "idle", step: null, approvalsPending: 0, error: null },
    mini: { open: false },
    live: { getCwd: () => "/proj" },
    approvalResponder: null,
    patchAgentMeta: (p) =>
      set((s) => ({ agentMeta: { ...s.agentMeta, ...p } })),
    openMini: () => set({ mini: { open: true } }),
    persistMessages: persistMock,
    setApprovalResponder: (fn) => set({ approvalResponder: fn }),
  }));
  return { useChatStore };
});

vi.mock("../../tools/tools", () => ({
  resolvePath: (p: string, cwd: string | null) =>
    p.startsWith("/") ? p : `${cwd ?? ""}/${p}`,
}));

vi.mock("../../lib/native", () => ({
  native: { readFile: readFileMock },
}));

import { useChatStore } from "../../store/chatStore";
import { useTodosStore } from "../../store/todoStore";
import { AgentRunBridge } from "./AgentRunBridge";

afterEach(cleanup);

type StoreLike = {
  getState: () => Record<string, never>;
  setState: (p: Record<string, unknown>) => void;
};

const store = useChatStore as unknown as StoreLike;

function meta(): Record<string, unknown> {
  return store.getState().agentMeta;
}

function approvalPart(
  type: string,
  over: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    type,
    toolCallId: "tc1",
    state: "approval-requested",
    approval: { id: "ap1" },
    ...over,
  };
}

function assistant(parts: Record<string, unknown>[]): unknown {
  return { id: "a1", role: "assistant", parts };
}

function renderBridge() {
  const openAiDiffTab = vi.fn(() => 1);
  const closeAiDiffTab = vi.fn();
  // A fresh element per render: React bails out on referentially
  // identical elements, which would keep the mocked useChat values stale.
  const make = () => (
    <AgentRunBridge
      openAiDiffTab={openAiDiffTab}
      closeAiDiffTab={closeAiDiffTab}
    />
  );
  const view = render(make());
  const sync = () => view.rerender(make());
  return { openAiDiffTab, closeAiDiffTab, sync, ...view };
}

beforeEach(() => {
  chatState.status = "ready";
  chatState.messages = [];
  chatState.addToolApprovalResponse = vi.fn();
  getOrCreateChatMock.mockClear();
  persistMock.mockClear();
  readFileMock.mockReset();
  useTodosStore.setState({ bySession: {} });
  store.setState({
    activeSessionId: "s1",
    agentMeta: { status: "idle", step: null, approvalsPending: 0, error: null },
    mini: { open: false },
    approvalResponder: null,
  });
});

describe("AgentRunBridge - lifecycle mirroring", () => {
  it("does not wire a chat when no session is active", () => {
    store.setState({ activeSessionId: null });
    const { container } = renderBridge();
    expect(container).toBeEmptyDOMElement();
    expect(getOrCreateChatMock).not.toHaveBeenCalled();
  });

  it("maps chat statuses onto agentMeta", () => {
    const { sync } = renderBridge();
    expect(meta().status).toBe("idle");

    chatState.status = "submitted";
    act(sync);
    expect(meta().status).toBe("thinking");

    chatState.status = "streaming";
    act(sync);
    expect(meta().status).toBe("streaming");

    chatState.status = "error";
    act(sync);
    expect(meta().status).toBe("error");
  });

  it("clears step and error when the run goes idle", () => {
    const { sync } = renderBridge();
    chatState.status = "streaming";
    act(sync);
    act(() => {
      store.setState({
        agentMeta: { ...meta(), step: "working", error: "old" },
      });
    });
    chatState.status = "ready";
    act(sync);
    expect(meta()).toMatchObject({ status: "idle", step: null, error: null });
  });

  it("clears the session's todos when the run finishes or errors", () => {
    useTodosStore
      .getState()
      .setTodos("s1", [{ id: "t1", title: "task", status: "in_progress" }]);
    const { sync } = renderBridge();
    // Run goes active…
    chatState.status = "streaming";
    act(sync);
    expect(useTodosStore.getState().bySession.s1).toHaveLength(1);
    // …then finishes → the todo list is cleared.
    chatState.status = "ready";
    act(sync);
    expect(useTodosStore.getState().bySession.s1).toBeUndefined();

    // Same on error.
    useTodosStore
      .getState()
      .setTodos("s1", [{ id: "t2", title: "task2", status: "in_progress" }]);
    chatState.status = "streaming";
    act(sync);
    chatState.status = "error";
    act(sync);
    expect(useTodosStore.getState().bySession.s1).toBeUndefined();
  });

  it("does not clear todos when the bridge mounts idle (no run yet)", () => {
    useTodosStore
      .getState()
      .setTodos("s1", [{ id: "t1", title: "restored", status: "in_progress" }]);
    // Mounts with status "ready" (idle) and never becomes active.
    const { sync } = renderBridge();
    act(sync);
    expect(useTodosStore.getState().bySession.s1).toHaveLength(1);
  });

  it("flags pending approvals and opens the mini window", () => {
    chatState.messages = [assistant([approvalPart("tool-run_command")])];
    renderBridge();
    expect(meta().status).toBe("awaiting-approval");
    expect(meta().approvalsPending).toBe(1);
    expect(store.getState().mini).toEqual({ open: true });
  });

  it.each(["ask_user", "ask_ui"])(
    "keeps the run waiting while %s needs a human response",
    (toolName) => {
      chatState.messages = [assistant([{
        type: `tool-${toolName}`,
        toolCallId: "question-1",
        state: "input-available",
        input: { question: "Continue?" },
      }])];

      renderBridge();

      expect(meta().status).toBe("awaiting-input");
      expect(store.getState().mini).toEqual({ open: true });
    },
  );

  it("registers an approval responder and clears it on unmount", () => {
    const { unmount } = renderBridge();
    const responder = store.getState().approvalResponder as (
      id: string,
      approved: boolean,
    ) => void;
    expect(responder).toBeTypeOf("function");
    responder("ap1", true);
    expect(respondApprovalMock).toHaveBeenCalledWith({
      sessionId: "s1",
      approvalId: "ap1",
      approved: true,
    }, expect.any(Function));
    expect(chatState.addToolApprovalResponse).toHaveBeenCalledWith({
      id: "ap1",
      approved: true,
    });
    unmount();
    expect(store.getState().approvalResponder).toBeNull();
  });

  // Message durability lives in the trace (Phase 4); the bridge only feeds
  // persistMessages for title derivation.
  it("feeds messages to persistMessages", () => {
    chatState.messages = [assistant([{ type: "text", text: "x" }])];
    renderBridge();
    expect(persistMock).toHaveBeenCalledWith("s1", chatState.messages);
  });
});

describe("AgentRunBridge - AI diff tabs", () => {
  it("opens a diff tab for a pending write_file", async () => {
    readFileMock.mockResolvedValue({ kind: "text", content: "old content" });
    chatState.messages = [
      assistant([
        approvalPart("tool-write_file", {
          input: { path: "file.txt", content: "new content" },
        }),
      ]),
    ];
    const { openAiDiffTab } = renderBridge();
    await waitFor(() => {
      expect(openAiDiffTab).toHaveBeenCalledWith({
        path: "/proj/file.txt",
        originalContent: "old content",
        proposedContent: "new content",
        approvalId: "ap1",
        isNewFile: false,
      });
    });
    expect(openAiDiffTab).toHaveBeenCalledTimes(1);
  });

  it("marks missing files as new", async () => {
    readFileMock.mockRejectedValue(
      new Error("No such file or directory (os error 2)"),
    );
    chatState.messages = [
      assistant([
        approvalPart("tool-write_file", {
          input: { path: "/proj/new.txt", content: "hello" },
        }),
      ]),
    ];
    const { openAiDiffTab } = renderBridge();
    await waitFor(() => {
      expect(openAiDiffTab).toHaveBeenCalledWith(
        expect.objectContaining({ isNewFile: true, originalContent: "" }),
      );
    });
  });

  it("derives proposed content for edit tools", async () => {
    readFileMock.mockResolvedValue({ kind: "text", content: "a foo b" });
    chatState.messages = [
      assistant([
        approvalPart("tool-edit", {
          input: { path: "/proj/e.ts", old_string: "foo", new_string: "bar" },
        }),
      ]),
    ];
    const { openAiDiffTab } = renderBridge();
    await waitFor(() => {
      expect(openAiDiffTab).toHaveBeenCalledWith(
        expect.objectContaining({ proposedContent: "a bar b" }),
      );
    });
  });

  it("skips the diff tab when an edit precondition fails", async () => {
    readFileMock.mockResolvedValue({ kind: "text", content: "abc" });
    chatState.messages = [
      assistant([
        approvalPart("tool-edit", {
          input: {
            path: "/proj/e.ts",
            old_string: "missing",
            new_string: "x",
          },
        }),
      ]),
    ];
    const { openAiDiffTab } = renderBridge();
    await waitFor(() => {
      expect(readFileMock).toHaveBeenCalled();
    });
    await Promise.resolve();
    expect(openAiDiffTab).not.toHaveBeenCalled();
  });

  it("closes the diff tab once the approval is resolved", async () => {
    readFileMock.mockResolvedValue({ kind: "text", content: "old" });
    const part = approvalPart("tool-write_file", {
      input: { path: "/proj/f.txt", content: "new" },
    });
    chatState.messages = [assistant([part])];
    const { openAiDiffTab, closeAiDiffTab, sync } = renderBridge();
    await waitFor(() => expect(openAiDiffTab).toHaveBeenCalled());

    chatState.messages = [assistant([{ ...part, state: "output-available" }])];
    act(sync);
    expect(closeAiDiffTab).toHaveBeenCalledWith("ap1");
  });

  it("does not reopen a tab for an already-opened approval", async () => {
    readFileMock.mockResolvedValue({ kind: "text", content: "old" });
    const part = approvalPart("tool-write_file", {
      input: { path: "/proj/f.txt", content: "new" },
    });
    chatState.messages = [assistant([part])];
    const { openAiDiffTab, sync } = renderBridge();
    await waitFor(() => expect(openAiDiffTab).toHaveBeenCalledTimes(1));

    // A new text token arrives: same mutation fingerprint, no re-open.
    chatState.messages = [
      assistant([part, { type: "text", text: "streaming on" }]),
    ];
    act(sync);
    await Promise.resolve();
    expect(openAiDiffTab).toHaveBeenCalledTimes(1);
  });
});
