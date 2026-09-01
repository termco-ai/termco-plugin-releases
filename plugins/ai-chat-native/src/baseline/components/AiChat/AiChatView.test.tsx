// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { ChatStatus, UIMessage } from "ai";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { sendMessageMock, deleteMessageMock, rewindToMock, respondInteractiveMock, respondApprovalMock } = vi.hoisted(() => ({
  sendMessageMock: vi.fn(),
  deleteMessageMock: vi.fn(),
  rewindToMock: vi.fn(),
  respondInteractiveMock: vi.fn(async (_input: unknown, publish: () => unknown) => publish()),
  respondApprovalMock: vi.fn(async (_input: unknown, publish: () => unknown) => publish()),
}));

vi.mock("../../../chatRuntime", () => ({
  respondToOwnedApproval: respondApprovalMock,
  respondToOwnedInteractiveTool: respondInteractiveMock,
}));

vi.mock("../../ai-elements/conversation", () => ({
  Conversation: ({ children }: { children?: React.ReactNode }) => (
    <div data-testid="conversation">{children}</div>
  ),
  ConversationContent: ({ children }: { children?: React.ReactNode }) => (
    <div>{children}</div>
  ),
  ConversationEmptyState: ({
    title,
    description,
  }: {
    title: string;
    description: string;
  }) => (
    <div data-testid="empty-state">
      <span>{title}</span>
      <span>{description}</span>
    </div>
  ),
  ConversationScrollButton: () => null,
}));

vi.mock("./RenderedMessage", () => ({
  RenderedMessage: ({
    message,
    streaming,
    onAnswerQuestion,
    onRespondUi,
    onApproval,
  }: {
    message: UIMessage;
    streaming: boolean;
    onAnswerQuestion?: (toolName: string, toolCallId: string, output: unknown) => void;
    onRespondUi?: (toolName: string, toolCallId: string, output: unknown) => void;
    onApproval: (id: string, approved: boolean) => void;
  }) => (
    <div data-testid="rendered-message" data-id={message.id} data-streaming={String(streaming)}>
      <button onClick={() => onAnswerQuestion?.("ask_user", "question-1", { answer: "yes" })}>
        Answer question
      </button>
      <button onClick={() => onRespondUi?.("ask_ui", "ui-1", { action: "confirm" })}>
        Respond to rich UI
      </button>
      <button onClick={() => onApproval("approval-1", true)}>Approve tool</button>
      <button onClick={() => onApproval("approval-1", false)}>Reject tool</button>
    </div>
  ),
}));

vi.mock("../../store/chatRuntime", () => ({
  sendMessage: sendMessageMock,
  deleteMessage: deleteMessageMock,
  rewindTo: rewindToMock,
  editUserMessage: vi.fn(),
  regenerateMessage: vi.fn(),
}));

vi.mock("../../store/chatStore", async () => {
  const { create } = await import("zustand");
  type MockState = {
    agentMeta: {
      step: string | null;
      hitStepCap: boolean;
      compactionNotice: { droppedCount: number; at: number } | null;
      compacting: { startedAt: number } | null;
    };
    activeSessionId: string | null;
    sessions: Array<{
      id: string;
      title: string;
      compaction?: Record<string, unknown>;
      compactionDeclined?: boolean;
    }>;
    newSession: () => string;
    patchAgentMeta: (p: Record<string, unknown>) => void;
  };
  const useChatStore = create<MockState>((set) => ({
    agentMeta: {
      step: null,
      hitStepCap: false,
      compactionNotice: null,
      compacting: null,
    },
    activeSessionId: "s1",
    sessions: [{ id: "s1", title: "Chat" }],
    newSession: () => "s2",
    patchAgentMeta: (p) =>
      set((s) => ({ agentMeta: { ...s.agentMeta, ...p } })),
  }));
  return { useChatStore };
});

import { useChatStore } from "../../store/chatStore";
import { AiChatView } from "./AiChatView";

afterEach(cleanup);

beforeEach(() => {
  sendMessageMock.mockReset();
  deleteMessageMock.mockReset();
  rewindToMock.mockReset();
  respondInteractiveMock.mockClear();
  respondApprovalMock.mockClear();
  useChatStore.setState({
    agentMeta: {
      step: null,
      hitStepCap: false,
      compactionNotice: null,
      compacting: null,
    },
    activeSessionId: "s1",
    sessions: [{ id: "s1", title: "Chat" }],
  } as never);
});

function msg(role: UIMessage["role"], id: string): UIMessage {
  return {
    id,
    role,
    parts: [{ type: "text", text: "x" }],
  } as unknown as UIMessage;
}

function renderView(over: Partial<Parameters<typeof AiChatView>[0]> = {}) {
  const props = {
    messages: [] as UIMessage[],
    status: "ready" as ChatStatus,
    error: undefined,
    clearError: vi.fn(),
    addToolApprovalResponse: vi.fn(),
    stop: vi.fn(),
    ...over,
  };
  return { props, ...render(<AiChatView {...props} />) };
}

describe("AiChatView", () => {
  it("shows the empty state when there are no messages", () => {
    renderView();
    expect(screen.getByTestId("empty-state")).toHaveTextContent(
      "Ask Termco anything",
    );
  });

  it("renders each message", () => {
    renderView({ messages: [msg("user", "u1"), msg("assistant", "a1")] });
    expect(screen.getAllByTestId("rendered-message")).toHaveLength(2);
  });

  it("routes both interactive tool answers through canonical session ownership", async () => {
    const addToolOutput = vi.fn();
    renderView({ messages: [msg("assistant", "a1")], addToolOutput });

    fireEvent.click(screen.getByRole("button", { name: "Answer question" }));
    fireEvent.click(screen.getByRole("button", { name: "Respond to rich UI" }));

    expect(respondInteractiveMock).toHaveBeenNthCalledWith(1, {
      sessionId: "s1",
      toolName: "ask_user",
      toolCallId: "question-1",
      output: { answer: "yes" },
    }, expect.any(Function));
    expect(respondInteractiveMock).toHaveBeenNthCalledWith(2, {
      sessionId: "s1",
      toolName: "ask_ui",
      toolCallId: "ui-1",
      output: { action: "confirm" },
    }, expect.any(Function));
    await vi.waitFor(() => expect(addToolOutput).toHaveBeenCalledTimes(2));
  });

  it("routes approval and rejection through canonical session ownership", async () => {
    const addToolApprovalResponse = vi.fn();
    renderView({ messages: [msg("assistant", "a1")], addToolApprovalResponse });

    fireEvent.click(screen.getByRole("button", { name: "Approve tool" }));
    fireEvent.click(screen.getByRole("button", { name: "Reject tool" }));

    expect(respondApprovalMock).toHaveBeenNthCalledWith(1, {
      sessionId: "s1",
      approvalId: "approval-1",
      approved: true,
    }, expect.any(Function));
    expect(respondApprovalMock).toHaveBeenNthCalledWith(2, {
      sessionId: "s1",
      approvalId: "approval-1",
      approved: false,
    }, expect.any(Function));
    await vi.waitFor(() => expect(addToolApprovalResponse).toHaveBeenCalledTimes(2));
  });

  it("confirms destructive transcript actions", () => {
    renderView({ messages: [msg("assistant", "a1")] });
    fireEvent.click(screen.getByRole("button", { name: "Delete message" }));
    expect(deleteMessageMock).not.toHaveBeenCalled();
    expect(screen.getByText("Delete this message?")).toBeInTheDocument();
    const deleteButtons = screen.getAllByRole("button", {
      name: "Delete message",
    });
    fireEvent.click(deleteButtons[deleteButtons.length - 1]);
    expect(deleteMessageMock).toHaveBeenCalledWith("a1");
  });

  it("shows the thinking spinner while busy with a trailing user message", () => {
    renderView({ messages: [msg("user", "u1")], status: "submitted" });
    expect(screen.getByRole("status")).toBeInTheDocument();
    expect(screen.getByText("Thinking…")).toBeInTheDocument();
  });

  it("prefers the live step label over the default spinner text", () => {
    useChatStore.setState({
      agentMeta: {
        step: "Running tests",
        hitStepCap: false,
        compactionNotice: null,
      },
    } as never);
    renderView({ messages: [msg("user", "u1")], status: "submitted" });
    expect(screen.getByText("Running tests")).toBeInTheDocument();
  });

  it("hides the spinner once the assistant is replying", () => {
    renderView({
      messages: [msg("user", "u1"), msg("assistant", "a1")],
      status: "streaming",
    });
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("flags only the streaming assistant message", () => {
    renderView({
      messages: [msg("user", "u1"), msg("assistant", "a1")],
      status: "streaming",
    });
    const rendered = screen.getAllByTestId("rendered-message");
    expect(rendered[0]).toHaveAttribute("data-streaming", "false");
    expect(rendered[1]).toHaveAttribute("data-streaming", "true");
  });

  it("shows the continue row after hitting the step cap and continues on click", () => {
    useChatStore.setState({
      agentMeta: { step: null, hitStepCap: true, compactionNotice: null },
    } as never);
    renderView({ messages: [msg("assistant", "a1")], status: "ready" });
    const btn = screen.getByRole("button", { name: "Continue" });
    fireEvent.click(btn);
    expect(useChatStore.getState().agentMeta.hitStepCap).toBe(false);
    expect(sendMessageMock).toHaveBeenCalledWith(
      expect.stringContaining("Continue from where you stopped"),
    );
  });

  it("hides the continue row while busy", () => {
    useChatStore.setState({
      agentMeta: { step: null, hitStepCap: true, compactionNotice: null },
    } as never);
    renderView({ messages: [msg("assistant", "a1")], status: "streaming" });
    expect(
      screen.queryByRole("button", { name: "Continue" }),
    ).not.toBeInTheDocument();
  });

  it("shows and dismisses the compaction notice", () => {
    useChatStore.setState({
      agentMeta: {
        step: null,
        hitStepCap: false,
        compactionNotice: { droppedCount: 3, at: 1 },
      },
    } as never);
    renderView({ messages: [msg("assistant", "a1")] });
    expect(screen.getByText(/3 older tool results elided/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Dismiss" }));
    expect(useChatStore.getState().agentMeta.compactionNotice).toBeNull();
    expect(
      screen.queryByText(/older tool results elided/),
    ).not.toBeInTheDocument();
  });

  it("uses singular wording for a single dropped tool result", () => {
    useChatStore.setState({
      agentMeta: {
        step: null,
        hitStepCap: false,
        compactionNotice: { droppedCount: 1, at: 1 },
      },
    } as never);
    renderView({ messages: [msg("assistant", "a1")] });
    expect(screen.getByText(/1 older tool result elided/)).toBeInTheDocument();
  });

  it("renders errors and clears them on dismiss", () => {
    const clearError = vi.fn();
    renderView({
      messages: [msg("assistant", "a1")],
      error: new Error("boom"),
      clearError,
    });
    expect(screen.getByText("Something went wrong.")).toBeInTheDocument();
    expect(screen.getByText("boom")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Dismiss" }));
    expect(clearError).toHaveBeenCalledTimes(1);
  });
});
