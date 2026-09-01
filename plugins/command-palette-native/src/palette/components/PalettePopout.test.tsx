// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PalettePopout } from "./PalettePopout";

afterEach(() => {
  cleanup();
});

beforeEach(() => {
  vi.clearAllMocks();
});

function barEl(): HTMLElement {
  const el = document.createElement("div");
  el.setAttribute("data-anchor", "");
  document.body.appendChild(el);
  return el;
}

describe("PalettePopout", () => {
  it("renders nothing while closed", () => {
    render(
      <PalettePopout open={false} onClose={vi.fn()} bar={null}>
        <span>body</span>
      </PalettePopout>,
    );
    expect(screen.queryByTestId("palette-popout")).toBeNull();
  });

  it("renders its children when open", () => {
    render(
      <PalettePopout open onClose={vi.fn()} bar={null}>
        <span>body</span>
      </PalettePopout>,
    );
    expect(screen.getByTestId("palette-popout")).toBeInTheDocument();
    expect(screen.getByText("body")).toBeInTheDocument();
  });

  it("closes on Escape", () => {
    const onClose = vi.fn();
    render(
      <PalettePopout open onClose={onClose} bar={null}>
        <span>body</span>
      </PalettePopout>,
    );
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("closes when pointing outside", () => {
    const onClose = vi.fn();
    render(
      <PalettePopout open onClose={onClose} bar={null}>
        <span>body</span>
      </PalettePopout>,
    );
    fireEvent.pointerDown(document.body);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("stays open when pointing inside the panel", () => {
    const onClose = vi.fn();
    render(
      <PalettePopout open onClose={onClose} bar={null}>
        <span>body</span>
      </PalettePopout>,
    );
    fireEvent.pointerDown(screen.getByText("body"));
    expect(onClose).not.toHaveBeenCalled();
  });

  it("leaves the anchor alone so the bar can toggle itself", () => {
    // Closing here too would fight the trigger's own click and re-open.
    const el = barEl();
    const onClose = vi.fn();
    render(
      <PalettePopout open onClose={onClose} bar={el}>
        <span>body</span>
      </PalettePopout>,
    );
    fireEvent.pointerDown(el);
    expect(onClose).not.toHaveBeenCalled();
  });

  it("hangs below the anchor once one is registered", () => {
    const el = barEl();
    el.getBoundingClientRect = () =>
      ({ top: 10, bottom: 40, left: 300, width: 340 }) as DOMRect;
    render(
      <PalettePopout open onClose={vi.fn()} bar={el}>
        <span>body</span>
      </PalettePopout>,
    );
    const panel = screen.getByTestId("palette-popout");
    expect(panel.style.top).toBe("39px"); // bar bottom, less the shared 1px seam
    expect(panel.style.left).toBe("300px");
    expect(panel.style.width).toBe("340px");
  });
});
