// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { useChatStore } from "../../store/chatStore";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AiMiniWindow } from "./AiMiniWindow";

vi.mock("../../runtime/platform", () => import("../../runtime/platformTestMock"));

vi.mock("../../lib/useMiniWindowGeometry", () => ({
  useMiniWindowGeometry: () => ({
    ref: { current: null },
    onHeaderPointerDown: vi.fn(),
    startResize: () => vi.fn(),
  }),
}));
vi.mock("../PlanDiffReview", () => ({
  PlanDiffReview: () => <div data-testid="plan-diff-review" />,
}));
vi.mock("./Body", () => ({
  Body: ({
    sessionId,
    onExpand,
    onClose,
  }: {
    sessionId: string;
    onExpand: () => void;
    onClose: () => void;
  }) => (
    <div data-testid="body" data-session={sessionId}>
      <button type="button" onClick={onExpand}>
        expand
      </button>
      <button type="button" onClick={onClose}>
        close
      </button>
    </div>
  ),
  EmptyShell: ({ onClose }: { onClose: () => void }) => (
    <div data-testid="empty-shell">
      <button type="button" onClick={onClose}>
        close
      </button>
    </div>
  ),
}));

function seed(activeSessionId: string | null) {
  useChatStore.setState({
    activeSessionId,
    closeMini: vi.fn(),
    openPanel: vi.fn(),
  });
}

afterEach(() => {
  cleanup();
  useChatStore.setState({ activeSessionId: null });
});

describe("AiMiniWindow", () => {
  it("renders the loading shell before sessions hydrate", () => {
    seed(null);
    render(<AiMiniWindow state="open" />);
    expect(screen.getByTestId("empty-shell")).toBeInTheDocument();
    expect(screen.queryByTestId("body")).not.toBeInTheDocument();
  });

  it("renders the live body for the active session", () => {
    seed("s1");
    render(<AiMiniWindow state="open" />);
    expect(screen.getByTestId("body")).toHaveAttribute("data-session", "s1");
    expect(screen.queryByTestId("empty-shell")).not.toBeInTheDocument();
  });

  it("exposes the presence state for enter/exit animations", () => {
    seed("s1");
    const { container } = render(<AiMiniWindow state="closed" />);
    const root = container.querySelector("[data-ai-mini-window]");
    expect(root).toHaveAttribute("data-state", "closed");
  });

  it("always mounts the plan diff review overlay", () => {
    seed("s1");
    render(<AiMiniWindow state="open" />);
    expect(screen.getByTestId("plan-diff-review")).toBeInTheDocument();
  });

  it("clears a stranded body pointer-events lock on mount and unmount", () => {
    seed("s1");
    // Simulate a Radix modal layer having stranded the lock before the popup
    // mounts — the mount-time safety net must recover it.
    document.body.style.pointerEvents = "none";
    const { unmount } = render(<AiMiniWindow state="open" />);
    expect(document.body.style.pointerEvents).toBe("");

    // And if a lock is stranded while open, unmounting must clear it too.
    document.body.style.pointerEvents = "none";
    unmount();
    expect(document.body.style.pointerEvents).toBe("");
  });

  it("leaves the lock alone while a real radix layer is open", () => {
    seed("s1");
    const layer = document.createElement("div");
    layer.setAttribute("data-radix-popper-content-wrapper", "");
    document.body.appendChild(layer);
    document.body.style.pointerEvents = "none";
    render(<AiMiniWindow state="open" />);
    // A legitimately-open menu still owns the lock — don't rip it out.
    expect(document.body.style.pointerEvents).toBe("none");
    layer.remove();
    document.body.style.pointerEvents = "";
  });

  it("closes the window when the header close button is clicked", () => {
    seed("s1");
    render(<AiMiniWindow state="open" />);
    fireEvent.click(screen.getByRole("button", { name: "close" }));
    expect(useChatStore.getState().closeMini).toHaveBeenCalledTimes(1);
  });

  it("closes from the loading shell's close button too", () => {
    seed(null);
    render(<AiMiniWindow state="open" />);
    fireEvent.click(screen.getByRole("button", { name: "close" }));
    expect(useChatStore.getState().closeMini).toHaveBeenCalledTimes(1);
  });

  it("closes on Escape", () => {
    seed("s1");
    render(<AiMiniWindow state="open" />);
    fireEvent.keyDown(window, { key: "Escape" });
    expect(useChatStore.getState().closeMini).toHaveBeenCalledTimes(1);
  });

  it("ignores Escape while typing in an input or textarea", () => {
    seed("s1");
    render(
      <div>
        <AiMiniWindow state="open" />
        <input data-testid="field" />
      </div>,
    );
    fireEvent.keyDown(screen.getByTestId("field"), { key: "Escape" });
    expect(useChatStore.getState().closeMini).not.toHaveBeenCalled();
  });

  it("expands to the panel by closing the mini window and opening the panel", () => {
    seed("s1");
    render(<AiMiniWindow state="open" />);
    fireEvent.click(screen.getByRole("button", { name: "expand" }));
    expect(useChatStore.getState().closeMini).toHaveBeenCalledTimes(1);
    expect(useChatStore.getState().openPanel).toHaveBeenCalledTimes(1);
  });
});
