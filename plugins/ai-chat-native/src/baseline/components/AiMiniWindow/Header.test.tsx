// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Header } from "./Header";

vi.mock("../../runtime/platform", () => import("../../runtime/platformTestMock"));

vi.mock("../AgentSwitcher", () => ({
  AgentSwitcher: () => <div data-testid="agent-switcher" />,
}));
vi.mock("./ContextIndicator", () => ({
  ContextIndicator: () => <div data-testid="context-indicator" />,
}));
vi.mock("./SessionPicker", () => ({
  SessionPicker: ({ className }: { className?: string }) => (
    <div data-testid="session-picker" className={className} />
  ),
}));

const baseProps = {
  onClose: () => {},
  onExpand: () => {},
  onHeaderPointerDown: () => {},
};

afterEach(cleanup);

describe("Header", () => {
  it("shows a compact busy spinner labelled with the current step", () => {
    render(<Header {...baseProps} step="Running tests" isBusy messages={[]} />);
    // The step is the spinner's accessible label / tooltip, not header text —
    // the visible step label lives in the transcript below.
    expect(screen.getByRole("status")).toBeInTheDocument();
    expect(screen.getByLabelText("Running tests")).toBeInTheDocument();
  });

  it("falls back to a generic busy label without a step", () => {
    render(<Header {...baseProps} step={null} isBusy messages={[]} />);
    expect(screen.getByLabelText("Thinking…")).toBeInTheDocument();
  });

  it("hides the busy indicator when idle", () => {
    render(
      <Header {...baseProps} step="stale step" isBusy={false} messages={[]} />,
    );
    expect(screen.queryByLabelText("stale step")).not.toBeInTheDocument();
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("renders the context indicator only when messages are provided", () => {
    const { rerender } = render(
      <Header {...baseProps} step={null} isBusy={false} messages={[]} />,
    );
    expect(screen.getByTestId("context-indicator")).toBeInTheDocument();
    rerender(<Header {...baseProps} step={null} isBusy={false} />);
    expect(screen.queryByTestId("context-indicator")).not.toBeInTheDocument();
  });

  it("always renders the agent switcher and session picker", () => {
    render(<Header {...baseProps} step={null} isBusy={false} />);
    expect(screen.getByTestId("agent-switcher")).toBeInTheDocument();
    expect(screen.getByTestId("session-picker")).toBeInTheDocument();
  });

  it("puts the session title in the flexible identity zone so it truncates", () => {
    // Regression: the title used to sit in the fixed (shrink-0) action group and
    // overflowed onto the agent pill / context meter. It must now grow+shrink.
    render(<Header {...baseProps} step={null} isBusy={false} messages={[]} />);
    const picker = screen.getByTestId("session-picker");
    expect(picker).toHaveClass("flex-1");
    expect(picker).toHaveClass("min-w-0");
  });

  it("closes via the close button", () => {
    const onClose = vi.fn();
    render(
      <Header {...baseProps} onClose={onClose} step={null} isBusy={false} />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("starts a drag from a pointerdown on the bar", () => {
    const onHeaderPointerDown = vi.fn();
    const { container } = render(
      <Header
        {...baseProps}
        onHeaderPointerDown={onHeaderPointerDown}
        step={null}
        isBusy={false}
      />,
    );
    fireEvent.pointerDown(container.firstElementChild as HTMLElement);
    expect(onHeaderPointerDown).toHaveBeenCalledTimes(1);
  });
});
