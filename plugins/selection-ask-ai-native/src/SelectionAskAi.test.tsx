// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@termco/ui", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@termco/ui")>()),
  MOD_KEY: "⌘",
  fmtShortcut: (...parts: string[]) => parts.join(""),
}));

import { SelectionAskAi } from "./SelectionAskAi";

afterEach(cleanup);

function renderPill(over: Partial<Parameters<typeof SelectionAskAi>[0]> = {}) {
  const props = {
    state: "open" as const,
    x: 500,
    y: 100,
    onAsk: vi.fn(),
    onDismiss: vi.fn(),
    ...over,
  };
  return { props, ...render(<SelectionAskAi {...props} />) };
}

describe("SelectionAskAi", () => {
  it("preserves the exact label, shortcut, position, and click behavior", () => {
    const { container, props } = renderPill();
    expect(screen.getByText("Ask Termco")).toBeInTheDocument();
    expect(screen.getByText("⌘L")).toBeInTheDocument();
    const element = container.firstElementChild as HTMLElement;
    expect(element.style.top).toBe("68px");
    expect(element.style.left).toBe("445px");
    expect(element.style.width).toBe("110px");
    fireEvent.click(screen.getByRole("button"));
    expect(props.onAsk).toHaveBeenCalledOnce();
  });

  it("clamps to every viewport edge", () => {
    const { container, rerender, props } = renderPill({ x: 0, y: 10 });
    let element = container.firstElementChild as HTMLElement;
    expect(element.style.top).toBe("8px");
    expect(element.style.left).toBe("8px");
    rerender(
      <SelectionAskAi {...props} state="open" x={window.innerWidth} y={100} />,
    );
    element = container.firstElementChild as HTMLElement;
    expect(element.style.left).toBe(`${window.innerWidth - 110 - 8}px`);
  });

  it("dismisses only on Escape while open", () => {
    const { props, rerender } = renderPill();
    fireEvent.keyDown(document, { key: "Enter" });
    expect(props.onDismiss).not.toHaveBeenCalled();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(props.onDismiss).toHaveBeenCalledOnce();
    rerender(<SelectionAskAi {...props} state="closed" x={0} y={0} />);
    fireEvent.keyDown(document, { key: "Escape" });
    expect(props.onDismiss).toHaveBeenCalledOnce();
  });

  it("keeps the last open position while animating out", () => {
    const { props, rerender, container } = renderPill();
    rerender(<SelectionAskAi {...props} state="closed" x={0} y={0} />);
    const element = container.firstElementChild as HTMLElement;
    expect(element.dataset.state).toBe("closed");
    expect(element.style.top).toBe("68px");
    expect(element.style.left).toBe("445px");
  });
});
