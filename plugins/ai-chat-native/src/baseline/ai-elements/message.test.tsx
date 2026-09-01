// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("streamdown", () => ({
  Streamdown: ({
    children,
    className,
    animated,
    isAnimating,
  }: {
    children?: ReactNode;
    className?: string;
    animated?: boolean;
    isAnimating?: boolean;
  }) => (
    <div
      data-testid="streamdown"
      data-animated={String(Boolean(animated))}
      data-animating={String(Boolean(isAnimating))}
      className={className}
    >
      {children}
    </div>
  ),
}));

vi.mock("../store/chatStore", () => ({
  useChatStore: {
    getState: () => ({ live: { injectIntoActivePty: () => false } }),
  },
}));

import {
  Message,
  MessageAction,
  MessageActions,
  MessageBranch,
  MessageBranchContent,
  MessageBranchNext,
  MessageBranchPage,
  MessageBranchPrevious,
  MessageBranchSelector,
  MessageContent,
  MessageResponse,
  MessageToolbar,
} from "./message";

afterEach(cleanup);

describe("Message", () => {
  it("marks user messages", () => {
    const { container } = render(<Message from="user">hi</Message>);
    const el = container.firstElementChild as HTMLElement;
    expect(el.className).toContain("is-user");
    expect(el.className).not.toContain("is-assistant");
  });

  it("marks assistant messages", () => {
    const { container } = render(<Message from="assistant">hi</Message>);
    const el = container.firstElementChild as HTMLElement;
    expect(el.className).toContain("is-assistant");
  });
});

describe("MessageContent, actions and toolbar", () => {
  it("renders content children", () => {
    render(<MessageContent className="c">body</MessageContent>);
    expect(screen.getByText("body")).toHaveClass("c");
  });

  it("renders actions and toolbar children", () => {
    render(
      <MessageToolbar>
        <MessageActions>
          <span>actions</span>
        </MessageActions>
      </MessageToolbar>,
    );
    expect(screen.getByText("actions")).toBeInTheDocument();
  });
});

describe("MessageAction", () => {
  it("renders a plain button with an sr-only label", () => {
    render(<MessageAction label="Copy">x</MessageAction>);
    const button = screen.getByRole("button");
    expect(button).toHaveTextContent("Copy");
  });

  it("wraps the button in a tooltip when tooltip is set", () => {
    render(<MessageAction tooltip="Retry">x</MessageAction>);
    const button = screen.getByRole("button");
    expect(button).toHaveTextContent("Retry");
    expect(button.getAttribute("data-state")).not.toBeNull();
  });
});

function Branches({
  onBranchChange,
}: {
  onBranchChange?: (i: number) => void;
}) {
  return (
    <MessageBranch onBranchChange={onBranchChange}>
      <MessageBranchContent>
        <p key="a">branch a</p>
        <p key="b">branch b</p>
      </MessageBranchContent>
      <MessageBranchSelector>
        <MessageBranchPrevious />
        <MessageBranchPage />
        <MessageBranchNext />
      </MessageBranchSelector>
    </MessageBranch>
  );
}

describe("MessageBranch", () => {
  it("throws when branch components are used standalone", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(() => render(<MessageBranchPage />)).toThrow(
      "MessageBranch components must be used within MessageBranch",
    );
    spy.mockRestore();
  });

  it("shows the first branch and the page indicator", () => {
    render(<Branches />);
    expect(screen.getByText("1 of 2")).toBeInTheDocument();
    expect(screen.getByText("branch a").parentElement?.className).toContain(
      "block",
    );
    expect(screen.getByText("branch b").parentElement?.className).toContain(
      "hidden",
    );
  });

  it("navigates forward and wraps around", () => {
    const onBranchChange = vi.fn();
    render(<Branches onBranchChange={onBranchChange} />);
    fireEvent.click(screen.getByLabelText("Next branch"));
    expect(screen.getByText("2 of 2")).toBeInTheDocument();
    expect(onBranchChange).toHaveBeenCalledWith(1);
    fireEvent.click(screen.getByLabelText("Next branch"));
    expect(screen.getByText("1 of 2")).toBeInTheDocument();
    expect(onBranchChange).toHaveBeenCalledWith(0);
  });

  it("navigates backwards with wrap-around", () => {
    render(<Branches />);
    fireEvent.click(screen.getByLabelText("Previous branch"));
    expect(screen.getByText("2 of 2")).toBeInTheDocument();
    fireEvent.click(screen.getByLabelText("Previous branch"));
    expect(screen.getByText("1 of 2")).toBeInTheDocument();
  });

  it("hides the selector and disables navigation for a single branch", () => {
    render(
      <MessageBranch>
        <MessageBranchContent>
          <p key="only">only branch</p>
        </MessageBranchContent>
        <MessageBranchSelector>
          <MessageBranchPage />
        </MessageBranchSelector>
        <MessageBranchPrevious />
        <MessageBranchNext />
      </MessageBranch>,
    );
    expect(screen.queryByText("1 of 1")).not.toBeInTheDocument();
    expect(screen.getByLabelText("Previous branch")).toBeDisabled();
    expect(screen.getByLabelText("Next branch")).toBeDisabled();
  });
});

describe("MessageResponse", () => {
  it("renders markdown through Streamdown", () => {
    render(<MessageResponse className="md">plain text</MessageResponse>);
    const el = screen.getByTestId("streamdown");
    expect(el).toHaveTextContent("plain text");
    expect(el.className).toContain("md");
  });

  it("skips re-render when children and streaming are unchanged", () => {
    const { rerender } = render(<MessageResponse>same</MessageResponse>);
    rerender(<MessageResponse>same</MessageResponse>);
    expect(screen.getByTestId("streamdown")).toHaveTextContent("same");
    rerender(<MessageResponse>changed</MessageResponse>);
    expect(screen.getByTestId("streamdown")).toHaveTextContent("changed");
  });

  it("keeps Streamdown on its synchronous streaming path while tokens arrive", () => {
    const { rerender } = render(
      <MessageResponse streaming>partial response</MessageResponse>,
    );
    expect(screen.getByTestId("streamdown")).toHaveAttribute("data-animated", "true");
    expect(screen.getByTestId("streamdown")).toHaveAttribute("data-animating", "false");

    rerender(<MessageResponse streaming={false}>complete response</MessageResponse>);
    expect(screen.getByTestId("streamdown")).toHaveAttribute("data-animated", "true");
    expect(screen.getByTestId("streamdown")).toHaveAttribute("data-animating", "false");
  });
});
