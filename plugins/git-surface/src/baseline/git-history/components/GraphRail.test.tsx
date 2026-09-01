// @vitest-environment jsdom
import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import type { GraphRow } from "../lib/graph";
import { laneColor } from "../lib/graph";
import { MAX_VISIBLE_LANES, railWidth } from "../lib/railGeometry";
import { GraphRail } from "./GraphRail";

afterEach(() => {
  cleanup();
});

function row(overrides: Partial<GraphRow> = {}): GraphRow {
  return {
    sha: "abc",
    lane: 0,
    nodeColor: laneColor(0),
    laneCount: 1,
    topEdges: [],
    bottomEdges: [],
    ...overrides,
  };
}

function renderRail(r: GraphRow, maxLaneCount = 2, active = false) {
  const { container } = render(
    <GraphRail
      row={r}
      rowHeight={32}
      maxLaneCount={maxLaneCount}
      active={active}
    />,
  );
  const svg = container.querySelector("svg") as SVGSVGElement;
  return { container, svg };
}

describe("GraphRail", () => {
  it("sizes the svg from the lane budget and row height", () => {
    const { svg } = renderRail(row(), 3);
    expect(svg.getAttribute("width")).toBe(String(railWidth(3)));
    expect(svg.getAttribute("height")).toBe("32");
  });

  it("renders straight edges as vertical lines in both halves", () => {
    const r = row({
      topEdges: [{ kind: "straight", lane: 0, color: laneColor(0) }],
      bottomEdges: [{ kind: "straight", lane: 0, color: laneColor(0) }],
    });
    const { svg } = renderRail(r);
    const lines = svg.querySelectorAll("line");
    expect(lines).toHaveLength(2);
    expect(lines[0].getAttribute("y1")).toBe("0");
    expect(lines[0].getAttribute("y2")).toBe("16");
    expect(lines[1].getAttribute("y1")).toBe("16");
    expect(lines[1].getAttribute("y2")).toBe("32");
  });

  it("renders merge and branch edges as curves", () => {
    const r = row({
      topEdges: [
        { kind: "merge", fromLane: 1, toLane: 0, color: laneColor(1) },
      ],
      bottomEdges: [
        { kind: "branch", fromLane: 0, toLane: 1, color: laneColor(1) },
      ],
    });
    const { svg } = renderRail(r);
    expect(svg.querySelectorAll("path")).toHaveLength(2);
    expect(svg.querySelectorAll("line")).toHaveLength(0);
  });

  it("ignores edge kinds that do not belong to a half", () => {
    const r = row({
      // A branch edge in the top half and a merge edge in the bottom half
      // are not drawable; the renderers must skip them.
      topEdges: [
        { kind: "branch", fromLane: 0, toLane: 1, color: laneColor(1) },
      ],
      bottomEdges: [
        { kind: "merge", fromLane: 1, toLane: 0, color: laneColor(1) },
      ],
    });
    const { svg } = renderRail(r);
    expect(svg.querySelectorAll("path")).toHaveLength(0);
    expect(svg.querySelectorAll("line")).toHaveLength(0);
  });

  it("draws the commit node in the row lane color", () => {
    const { svg } = renderRail(row({ lane: 1, nodeColor: laneColor(1) }), 2);
    const circles = svg.querySelectorAll("circle");
    expect(circles).toHaveLength(1);
    expect(circles[0].getAttribute("fill")).toBe(laneColor(1));
  });

  it("adds a halo ring when active", () => {
    const { svg } = renderRail(row(), 2, true);
    expect(svg.querySelectorAll("circle")).toHaveLength(2);
  });

  it("shows an overflow marker beyond the visible lane budget", () => {
    const r = row({ laneCount: MAX_VISIBLE_LANES + 2 });
    const { svg } = renderRail(r, MAX_VISIBLE_LANES + 2);
    expect(svg.querySelector("text")?.textContent).toBe("+2");
  });

  it("shows no overflow marker within the budget", () => {
    const { svg } = renderRail(row({ laneCount: 2 }), 2);
    expect(svg.querySelector("text")).toBeNull();
  });
});
