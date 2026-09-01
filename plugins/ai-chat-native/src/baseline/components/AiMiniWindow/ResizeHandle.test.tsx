// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { RESIZE_DIRS, ResizeHandle } from "./ResizeHandle";

afterEach(cleanup);

describe("RESIZE_DIRS", () => {
  it("covers all four edges and four corners", () => {
    expect([...RESIZE_DIRS].sort()).toEqual(
      ["e", "n", "ne", "nw", "s", "se", "sw", "w"].sort(),
    );
  });
});

describe("ResizeHandle", () => {
  it("forwards pointerdown to the handler", () => {
    const onPointerDown = vi.fn();
    const { container } = render(
      <ResizeHandle dir="se" onPointerDown={onPointerDown} />,
    );
    const el = container.firstElementChild as HTMLElement;
    fireEvent.pointerDown(el);
    expect(onPointerDown).toHaveBeenCalledTimes(1);
  });

  it("is excluded from header dragging via data-no-drag", () => {
    const { container } = render(
      <ResizeHandle dir="n" onPointerDown={() => {}} />,
    );
    const el = container.firstElementChild as HTMLElement;
    expect(el).toHaveAttribute("data-no-drag");
    expect(el.className).toContain("cursor-ns-resize");
  });

  it("applies a direction-specific cursor per dir", () => {
    for (const dir of RESIZE_DIRS) {
      const { container, unmount } = render(
        <ResizeHandle dir={dir} onPointerDown={() => {}} />,
      );
      const el = container.firstElementChild as HTMLElement;
      expect(el.className, `cursor for ${dir}`).toMatch(/cursor-\w+-resize/);
      unmount();
    }
  });
});
