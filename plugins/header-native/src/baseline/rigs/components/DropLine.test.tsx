// @vitest-environment jsdom
import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { DropLine } from "./DropLine";

afterEach(cleanup);

describe("DropLine", () => {
  it("anchors to the top edge", () => {
    const { container } = render(<DropLine edge="top" />);
    const el = container.firstElementChild as HTMLElement;
    expect(el.className).toContain("top-0");
    expect(el.className).not.toContain("bottom-0");
  });

  it("anchors to the bottom edge", () => {
    const { container } = render(<DropLine edge="bottom" />);
    const el = container.firstElementChild as HTMLElement;
    expect(el.className).toContain("bottom-0");
    expect(el.className).not.toContain("top-0");
  });
});
