// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { UIMessage } from "ai";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const stick = vi.hoisted(() => ({
  isAtBottom: true,
  scrollToBottom: vi.fn(),
}));

vi.mock("use-stick-to-bottom", () => {
  const StickToBottom = ({
    children,
    initial: _initial,
    resize: _resize,
    ...props
  }: {
    children?: ReactNode;
    initial?: unknown;
    resize?: unknown;
    className?: string;
    role?: string;
  }) => <div {...props}>{children}</div>;
  StickToBottom.Content = ({
    children,
    ...props
  }: {
    children?: ReactNode;
    className?: string;
  }) => <div {...props}>{children}</div>;
  return {
    StickToBottom,
    useStickToBottomContext: () => stick,
  };
});

import {
  Conversation,
  ConversationContent,
  ConversationDownload,
  ConversationEmptyState,
  ConversationScrollButton,
  messagesToMarkdown,
} from "./conversation";

beforeEach(() => {
  stick.isAtBottom = true;
  stick.scrollToBottom.mockClear();
});

afterEach(cleanup);

function textMessage(role: UIMessage["role"], text: string): UIMessage {
  return {
    id: `${role}-${text}`,
    role,
    parts: [
      { type: "text", text },
      { type: "step-start" },
    ],
  } as UIMessage;
}

describe("Conversation", () => {
  it("renders a log region with merged classes", () => {
    render(<Conversation className="extra">inner</Conversation>);
    const log = screen.getByRole("log");
    expect(log).toHaveTextContent("inner");
    expect(log.className).toContain("extra");
    expect(log.className).toContain("relative");
  });

  it("renders content with layout classes", () => {
    render(<ConversationContent className="pad">body</ConversationContent>);
    const el = screen.getByText("body");
    expect(el.className).toContain("flex-col");
    expect(el.className).toContain("pad");
  });
});

describe("ConversationEmptyState", () => {
  it("renders default title and description", () => {
    render(<ConversationEmptyState />);
    expect(screen.getByText("No messages yet")).toBeInTheDocument();
    expect(
      screen.getByText("Start a conversation to see messages here"),
    ).toBeInTheDocument();
  });

  it("renders a custom icon, title and description", () => {
    render(
      <ConversationEmptyState
        title="Empty"
        description="Nothing here"
        icon={<span>icon</span>}
      />,
    );
    expect(screen.getByText("icon")).toBeInTheDocument();
    expect(screen.getByText("Empty")).toBeInTheDocument();
    expect(screen.getByText("Nothing here")).toBeInTheDocument();
  });

  it("prefers custom children over the defaults", () => {
    render(
      <ConversationEmptyState title="Empty">
        <p>custom body</p>
      </ConversationEmptyState>,
    );
    expect(screen.getByText("custom body")).toBeInTheDocument();
    expect(screen.queryByText("Empty")).not.toBeInTheDocument();
  });
});

describe("ConversationScrollButton", () => {
  it("renders nothing while at the bottom", () => {
    const { container } = render(<ConversationScrollButton />);
    expect(container).toBeEmptyDOMElement();
  });

  it("scrolls to bottom on click when scrolled up", () => {
    stick.isAtBottom = false;
    render(<ConversationScrollButton />);
    fireEvent.click(screen.getByRole("button"));
    expect(stick.scrollToBottom).toHaveBeenCalledTimes(1);
  });
});

describe("messagesToMarkdown", () => {
  it("formats roles and joins text parts", () => {
    const md = messagesToMarkdown([
      textMessage("user", "hello"),
      textMessage("assistant", "hi there"),
    ]);
    expect(md).toBe("**User:** hello\n\n**Assistant:** hi there");
  });

  it("supports a custom formatter", () => {
    const md = messagesToMarkdown(
      [textMessage("user", "a"), textMessage("assistant", "b")],
      (m, i) => `${i}:${m.role}`,
    );
    expect(md).toBe("0:user\n\n1:assistant");
  });
});

describe("ConversationDownload", () => {
  it("downloads the conversation as markdown", () => {
    const createObjectURL = vi.fn(() => "blob:mock");
    const revokeObjectURL = vi.fn();
    Object.defineProperty(URL, "createObjectURL", {
      value: createObjectURL,
      configurable: true,
    });
    Object.defineProperty(URL, "revokeObjectURL", {
      value: revokeObjectURL,
      configurable: true,
    });
    const click = vi
      .spyOn(HTMLAnchorElement.prototype, "click")
      .mockImplementation(() => {});

    render(
      <ConversationDownload
        messages={[textMessage("user", "hello")]}
        filename="chat.md"
      />,
    );
    fireEvent.click(screen.getByRole("button"));

    expect(createObjectURL).toHaveBeenCalledTimes(1);
    expect(click).toHaveBeenCalledTimes(1);
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:mock");
    click.mockRestore();
  });
});
