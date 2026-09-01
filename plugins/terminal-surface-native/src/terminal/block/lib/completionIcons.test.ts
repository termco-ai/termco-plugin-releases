// Kept with the source-owning terminal plugin.
// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { completionIcon, hugeIcon, type IconData } from "./completionIcons";

const ICON: IconData = [
  ["path", { d: "M1 2", "stroke-width": 2 }],
  ["circle", { cx: 12, cy: 12, r: 4 }],
];

describe("hugeIcon", () => {
  it("builds an svg with the default size and stroke setup", () => {
    const svg = hugeIcon(ICON);
    expect(svg.namespaceURI).toBe("http://www.w3.org/2000/svg");
    expect(svg.getAttribute("width")).toBe("13");
    expect(svg.getAttribute("height")).toBe("13");
    expect(svg.getAttribute("viewBox")).toBe("0 0 24 24");
    expect(svg.getAttribute("stroke")).toBe("currentColor");
  });

  it("renders each icon segment with its attributes", () => {
    const svg = hugeIcon(ICON, 20);
    expect(svg.getAttribute("width")).toBe("20");
    expect(svg.children).toHaveLength(2);
    expect(svg.children[0].tagName).toBe("path");
    expect(svg.children[0].getAttribute("d")).toBe("M1 2");
    expect(svg.children[1].tagName).toBe("circle");
    expect(svg.children[1].getAttribute("r")).toBe("4");
  });
});

describe("completionIcon", () => {
  it.each([
    "function",
    "keyword",
    "type",
    "variable",
  ])("wraps a %s icon in a styled span", (type) => {
    const el = completionIcon(type);
    expect(el).not.toBeNull();
    expect(el?.className).toBe("cm-opt-icon");
    expect(el?.querySelector("svg")).not.toBeNull();
  });

  it("returns null for unknown or missing types", () => {
    expect(completionIcon("text")).toBeNull();
    expect(completionIcon(undefined)).toBeNull();
  });
});
