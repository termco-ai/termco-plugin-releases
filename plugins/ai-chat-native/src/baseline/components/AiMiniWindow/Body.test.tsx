// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { useChatStore } from "../../store/chatStore";
import { usePlanStore } from "../../store/planStore";
import type { UIMessage } from "@ai-sdk/react";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Body, EmptyShell } from "./Body";

vi.mock("../../runtime/platform", () => import("../../runtime/platformTestMock"));

const h = vi.hoisted(() => ({
  useChatResult: {
    messages: [] as UIMessage[],
    status: "ready",
    error: undefined as Error | undefined,
    clearError: () => {},
    addToolApprovalResponse: () => {},
    stop: () => {},
  },
}));

vi.mock("@ai-sdk/react", () => ({
  useChat: vi.fn(() => h.useChatResult),
}));
vi.mock("../../store/chatRuntime", () => ({
  getOrCreateChat: vi.fn(() => ({ id: "chat-stub" })),
}));
vi.mock("../AiChat", () => ({
  AiChatView: ({ messages }: { messages: UIMessage[] }) => (
    <div data-testid="ai-chat-view">{messages.length} messages</div>
  ),
}));
vi.mock("../TodoStrip", () => ({
  TodoStrip: ({ sessionId }: { sessionId: string }) => (
    <div data-testid="todo-strip">{sessionId}</div>
  ),
}));
vi.mock("./Header", () => ({
  Header: ({ isBusy, step }: { isBusy: boolean; step: string | null }) => (
    <div data-testid="header" data-busy={isBusy} data-step={step ?? ""} />
  ),
}));
vi.mock("../AiComposer", () => ({
  AiComposer: () => <div data-testid="ai-composer" />,
}));

const bodyProps = {
  sessionId: "s1",
  onClose: () => {},
  onExpand: () => {},
  onHeaderPointerDown: () => {},
};

function uiMessage(id: string): UIMessage {
  return { id, role: "user", parts: [] } as unknown as UIMessage;
}

afterEach(() => {
  cleanup();
  h.useChatResult.messages = [];
  h.useChatResult.status = "ready";
  usePlanStore.setState({ active: false, queue: [] });
});

describe("Body", () => {
  it("shows the empty state when there are no messages", () => {
    render(<Body {...bodyProps} />);
    expect(screen.getByText("What should happen next?")).toBeInTheDocument();
    expect(screen.queryByTestId("ai-chat-view")).not.toBeInTheDocument();
  });

  it("focuses the input with the picked suggestion text", () => {
    const focusInput = vi.fn();
    useChatStore.setState({ focusInput });
    render(<Body {...bodyProps} />);
    fireEvent.click(
      screen.getByRole("button", { name: /summarize recent activity/i }),
    );
    expect(focusInput).toHaveBeenCalledWith(
      "Summarize what just happened in the terminal.",
    );
  });

  it("renders the transcript once messages exist", () => {
    h.useChatResult.messages = [uiMessage("a"), uiMessage("b")];
    render(<Body {...bodyProps} />);
    expect(screen.getByTestId("ai-chat-view")).toHaveTextContent("2 messages");
    expect(
      screen.queryByText("What should happen next?"),
    ).not.toBeInTheDocument();
  });

  it("marks the header busy while streaming", () => {
    h.useChatResult.status = "streaming";
    render(<Body {...bodyProps} />);
    expect(screen.getByTestId("header")).toHaveAttribute("data-busy", "true");
  });

  it("keeps the header idle when the chat is ready", () => {
    h.useChatResult.status = "ready";
    render(<Body {...bodyProps} />);
    expect(screen.getByTestId("header")).toHaveAttribute("data-busy", "false");
  });

  it("passes the session id to the todo strip", () => {
    render(<Body {...bodyProps} />);
    expect(screen.getByTestId("todo-strip")).toHaveTextContent("s1");
  });

  it("hides the plan strip while plan mode is off", () => {
    render(<Body {...bodyProps} />);
    expect(screen.queryByText("Plan mode")).not.toBeInTheDocument();
  });

  it("shows the plan strip with the queued-edit count", () => {
    usePlanStore.setState({
      active: true,
      queue: [
        {
          id: "q1",
          kind: "write_file",
          path: "a",
          originalContent: "",
          proposedContent: "",
          isNewFile: false,
        },
      ],
    });
    render(<Body {...bodyProps} />);
    expect(screen.getByText("Plan mode")).toBeInTheDocument();
    expect(screen.getByText("· 1 queued")).toBeInTheDocument();
  });

  it("shows a no-edits hint when the plan queue is empty", () => {
    usePlanStore.setState({ active: true, queue: [] });
    render(<Body {...bodyProps} />);
    expect(screen.getByText("· no edits queued")).toBeInTheDocument();
  });

  it("exits plan mode from the strip", () => {
    usePlanStore.setState({ active: true, queue: [] });
    render(<Body {...bodyProps} />);
    act(() => {
      fireEvent.click(screen.getByRole("button", { name: "Exit" }));
    });
    expect(usePlanStore.getState().active).toBe(false);
    expect(screen.queryByText("Plan mode")).not.toBeInTheDocument();
  });
});

describe("EmptyShell", () => {
  it("renders the loading placeholder with an idle header", () => {
    render(
      <EmptyShell
        onClose={() => {}}
        onExpand={() => {}}
        onHeaderPointerDown={() => {}}
      />,
    );
    expect(screen.getByText("Loading sessions…")).toBeInTheDocument();
    expect(screen.getByTestId("header")).toHaveAttribute("data-busy", "false");
  });
});
