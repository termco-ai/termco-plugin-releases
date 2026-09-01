// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const chatStore = vi.hoisted(() => ({
  inject: vi.fn((_text: string) => true),
}));

vi.mock("../store/chatStore", () => ({
  useChatStore: {
    getState: () => ({ live: { injectIntoActivePty: chatStore.inject } }),
  },
}));

import { ChatCodeBlock, ChatStreamingProvider } from "./chat-code";

beforeEach(() => {
  chatStore.inject.mockClear();
  chatStore.inject.mockReturnValue(true);
});

afterEach(cleanup);

describe("ChatCodeBlock while streaming", () => {
  it("shows a generating placeholder with the language label", () => {
    render(
      <ChatStreamingProvider value={true}>
        <ChatCodeBlock code="const x = 1;" lang="ts" />
      </ChatStreamingProvider>,
    );
    expect(screen.getByText("Generating ts…")).toBeInTheDocument();
    expect(screen.queryByText("const x = 1;")).not.toBeInTheDocument();
  });

  it("falls back to a generic label without a language", () => {
    render(
      <ChatStreamingProvider value={true}>
        <ChatCodeBlock code="x" lang={null} />
      </ChatStreamingProvider>,
    );
    expect(screen.getByText("Generating code…")).toBeInTheDocument();
  });
});

describe("ChatCodeBlock command cards", () => {
  it("renders a POSIX shell command with a $ prompt and bash label", () => {
    render(<ChatCodeBlock code="ls -la" lang="zsh" />);
    expect(screen.getByText("bash")).toBeInTheDocument();
    expect(screen.getByText("$")).toBeInTheDocument();
    expect(screen.getByText("ls -la")).toBeInTheDocument();
  });

  it("renders pwsh with a PS> prompt and powershell label", () => {
    render(<ChatCodeBlock code="Get-ChildItem" lang="pwsh" />);
    expect(screen.getByText("powershell")).toBeInTheDocument();
    expect(screen.getByText("PS>")).toBeInTheDocument();
  });

  it("renders bat as cmd with a > prompt", () => {
    render(<ChatCodeBlock code="dir" lang="bat" />);
    expect(screen.getByText("cmd")).toBeInTheDocument();
    expect(screen.getByText(">")).toBeInTheDocument();
  });

  it("prompts each line of a multiline command", () => {
    render(<ChatCodeBlock code={"echo a\necho b"} lang="bash" />);
    expect(screen.getAllByText("$")).toHaveLength(2);
    expect(screen.getByText("echo a")).toBeInTheDocument();
    expect(screen.getByText("echo b")).toBeInTheDocument();
  });

  it("sends the command to the active terminal and resets the label", () => {
    vi.useFakeTimers();
    try {
      render(<ChatCodeBlock code="ls" lang="sh" />);
      fireEvent.click(screen.getByLabelText("Run in active terminal"));
      expect(chatStore.inject).toHaveBeenCalledWith("ls");
      expect(screen.getByText("Sent")).toBeInTheDocument();
      act(() => {
        vi.advanceTimersByTime(1500);
      });
      expect(screen.getByText("Run")).toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });

  it("stays on Run when no terminal accepts the injection", () => {
    chatStore.inject.mockReturnValue(false);
    render(<ChatCodeBlock code="ls" lang="sh" />);
    fireEvent.click(screen.getByLabelText("Run in active terminal"));
    expect(screen.getByText("Run")).toBeInTheDocument();
    expect(screen.queryByText("Sent")).not.toBeInTheDocument();
  });
});

describe("ChatCodeBlock finalized blocks", () => {
  it("renders a plain pre for non-highlightable languages", () => {
    render(<ChatCodeBlock code="plain body" lang="weirdlang" />);
    expect(screen.getByText("weirdlang")).toBeInTheDocument();
    expect(screen.getByText("plain body")).toBeInTheDocument();
  });

  it("highlights known languages asynchronously", async () => {
    const { container } = render(
      <ChatCodeBlock code="const x = 1;" lang="ts" />,
    );
    await waitFor(() => {
      expect(container.querySelector(".tok-keyword")).not.toBeNull();
    });
    expect(container.querySelector("pre")).toHaveTextContent("const x = 1;");
  });

  it("copies the code to the clipboard", async () => {
    const writeText = vi.fn(async () => {});
    Object.defineProperty(navigator, "clipboard", {
      value: { writeText },
      configurable: true,
    });
    render(<ChatCodeBlock code="copy me" lang="weirdlang" />);
    fireEvent.click(screen.getByLabelText("Copy code"));
    await waitFor(() => {
      expect(writeText).toHaveBeenCalledWith("copy me");
    });
  });

  it("ignores copy clicks when the clipboard API is missing", () => {
    Object.defineProperty(navigator, "clipboard", {
      value: undefined,
      configurable: true,
    });
    render(<ChatCodeBlock code="copy me" lang="weirdlang" />);
    fireEvent.click(screen.getByLabelText("Copy code"));
    expect(screen.getByText("copy me")).toBeInTheDocument();
  });
});
