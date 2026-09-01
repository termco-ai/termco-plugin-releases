// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { Reasoning, ReasoningContent, ReasoningTrigger } from "./reasoning";

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("ReasoningTrigger", () => {
  it("shows a thinking shimmer while streaming", () => {
    render(
      <Reasoning isStreaming>
        <ReasoningTrigger />
      </Reasoning>,
    );
    expect(screen.getByText("Thinking")).toBeInTheDocument();
  });

  it("shows Reasoned when idle without a duration", () => {
    render(
      <Reasoning>
        <ReasoningTrigger />
      </Reasoning>,
    );
    expect(screen.getByText("Reasoned")).toBeInTheDocument();
  });

  it("shows the reasoning duration when known", () => {
    render(
      <Reasoning duration={7}>
        <ReasoningTrigger />
      </Reasoning>,
    );
    expect(screen.getByText("Reasoned for 7s")).toBeInTheDocument();
  });

  it("treats a zero duration as still thinking", () => {
    render(
      <Reasoning duration={0}>
        <ReasoningTrigger />
      </Reasoning>,
    );
    expect(screen.getByText("Thinking")).toBeInTheDocument();
  });

  it("renders custom trigger children", () => {
    render(
      <Reasoning>
        <ReasoningTrigger>custom trigger</ReasoningTrigger>
      </Reasoning>,
    );
    expect(screen.getByText("custom trigger")).toBeInTheDocument();
  });

  it("supports a custom thinking message factory", () => {
    render(
      <Reasoning duration={3}>
        <ReasoningTrigger
          getThinkingMessage={(streaming, duration) => (
            <span>{streaming ? "busy" : `took ${duration}`}</span>
          )}
        />
      </Reasoning>,
    );
    expect(screen.getByText("took 3")).toBeInTheDocument();
  });

  it("throws outside of Reasoning", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(() => render(<ReasoningTrigger />)).toThrow(
      "Reasoning components must be used within Reasoning",
    );
    spy.mockRestore();
  });
});

describe("Reasoning open state", () => {
  it("opens by default while streaming and shows content", () => {
    render(
      <Reasoning isStreaming>
        <ReasoningTrigger />
        <ReasoningContent>the thoughts</ReasoningContent>
      </Reasoning>,
    );
    expect(screen.getByText("the thoughts")).toBeInTheDocument();
  });

  it("stays closed when defaultOpen is explicitly false", () => {
    render(
      <Reasoning isStreaming defaultOpen={false}>
        <ReasoningTrigger />
        <ReasoningContent>the thoughts</ReasoningContent>
      </Reasoning>,
    );
    expect(screen.queryByText("the thoughts")).not.toBeInTheDocument();
  });

  it("toggles via the trigger and reports onOpenChange", () => {
    const onOpenChange = vi.fn();
    render(
      <Reasoning onOpenChange={onOpenChange}>
        <ReasoningTrigger />
        <ReasoningContent>the thoughts</ReasoningContent>
      </Reasoning>,
    );
    fireEvent.click(screen.getByText("Reasoned"));
    expect(onOpenChange).toHaveBeenCalledWith(true);
    expect(screen.getByText("the thoughts")).toBeInTheDocument();
  });

  it("computes the duration and auto-closes after streaming ends", () => {
    vi.useFakeTimers();
    const { rerender } = render(
      <Reasoning isStreaming>
        <ReasoningTrigger />
        <ReasoningContent>the thoughts</ReasoningContent>
      </Reasoning>,
    );
    expect(screen.getByText("the thoughts")).toBeInTheDocument();

    act(() => {
      vi.advanceTimersByTime(3000);
    });
    rerender(
      <Reasoning isStreaming={false}>
        <ReasoningTrigger />
        <ReasoningContent>the thoughts</ReasoningContent>
      </Reasoning>,
    );
    expect(screen.getByText("Reasoned for 3s")).toBeInTheDocument();

    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(screen.queryByText("the thoughts")).not.toBeInTheDocument();

    fireEvent.click(screen.getByText("Reasoned for 3s"));
    expect(screen.getByText("the thoughts")).toBeInTheDocument();
    act(() => {
      vi.advanceTimersByTime(5000);
    });
    expect(screen.getByText("the thoughts")).toBeInTheDocument();
  });
});
