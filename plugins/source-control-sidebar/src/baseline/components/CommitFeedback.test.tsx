// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CommitFeedback } from "./CommitFeedback";

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("CommitFeedback", () => {
  it("renders nothing without feedback", () => {
    const { container } = render(<CommitFeedback feedback={null} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("shows a success message with the muted styling", () => {
    render(
      <CommitFeedback
        feedback={{ tone: "success", message: "Committed abc1234" }}
      />,
    );
    const message = screen.getByText("Committed abc1234");
    expect(message).toBeInTheDocument();
    expect(message.className).toContain("text-muted-foreground");
  });

  it("styles errors with the destructive tone", () => {
    render(
      <CommitFeedback feedback={{ tone: "error", message: "push failed" }} />,
    );
    expect(screen.getByText("push failed").className).toContain(
      "text-destructive",
    );
  });

  it("auto-hides and then clears the message", () => {
    render(<CommitFeedback feedback={{ tone: "success", message: "done" }} />);
    expect(screen.getByText("done").parentElement?.className).toContain(
      "opacity-100",
    );
    act(() => {
      vi.advanceTimersByTime(3700);
    });
    expect(screen.getByText("done").parentElement?.className).toContain(
      "opacity-0",
    );
    act(() => {
      vi.advanceTimersByTime(300);
    });
    expect(screen.queryByText("done")).toBeNull();
  });

  it("keeps showing the latest feedback when it changes", () => {
    const { rerender } = render(
      <CommitFeedback feedback={{ tone: "success", message: "first" }} />,
    );
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    rerender(
      <CommitFeedback feedback={{ tone: "error", message: "second" }} />,
    );
    expect(screen.getByText("second")).toBeInTheDocument();
    act(() => {
      vi.advanceTimersByTime(3800);
    });
    expect(screen.getByText("second").parentElement?.className).toContain(
      "opacity-0",
    );
  });

  it("hides immediately when feedback is removed", () => {
    const { rerender } = render(
      <CommitFeedback feedback={{ tone: "success", message: "stale" }} />,
    );
    rerender(<CommitFeedback feedback={null} />);
    expect(screen.getByText("stale").parentElement?.className).toContain(
      "opacity-0",
    );
  });
});
