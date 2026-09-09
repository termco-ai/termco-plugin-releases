// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { getSnapTarget, useSplitDrag } from "./useSplitDrag";

let surface: HTMLElement;
beforeEach(() => {
  surface = document.createElement("div");
  surface.setAttribute("data-workspace-surface", "true");
  surface.getBoundingClientRect = () => ({ left: 100, top: 100, right: 1300, bottom: 700,
    width: 1200, height: 600, x: 100, y: 100, toJSON: () => ({}) });
  document.body.append(surface);
});
afterEach(() => { surface.remove(); useSplitDrag.getState().setTarget(null); });

describe("workspace snap targets", () => {
  it.each([
    [150, 400, "left"], [1250, 400, "right"], [700, 120, "top"],
    [1000, 680, "bottom"], [400, 680, "bottom"],
    [700, 400, "center"], [50, 400, null], [700, 750, null],
  ] as const)("maps pointer (%i, %i) to %s", (x, y, target) => {
    expect(getSnapTarget(x, y)).toBe(target);
  });
  it("does not reuse a removed surface or a hidden workspace", () => {
    surface.getBoundingClientRect = () => new DOMRect();
    expect(getSnapTarget(0, 0)).toBeNull();
    surface.remove();
    expect(getSnapTarget(700, 400)).toBeNull();
  });
});
