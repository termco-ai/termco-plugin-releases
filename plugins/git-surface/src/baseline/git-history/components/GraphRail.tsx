/**
 * SVG commit-graph rail for one history row: draws the straight/merge/branch
 * edges entering and leaving the row, the commit node, and an overflow "+N"
 * marker when a row exceeds the visible lane budget. Lane→pixel geometry is
 * delegated to `../lib/railGeometry`.
 */
import { memo, type ReactElement } from "react";
import type { GraphEdge, GraphRow } from "../lib/graph";
import { laneX, MAX_VISIBLE_LANES, railWidth } from "../lib/railGeometry";

const STRAIGHT_WIDTH = 2;
const CURVE_WIDTH = 2;

type Props = {
  row: GraphRow;
  rowHeight: number;
  maxLaneCount: number;
  active?: boolean;
};

function renderTopEdge(edge: GraphEdge, midY: number): ReactElement | null {
  if (edge.kind === "straight") {
    const x = laneX(edge.lane);
    return (
      <line
        key={`t-s-${edge.lane}`}
        x1={x}
        y1={0}
        x2={x}
        y2={midY}
        stroke={edge.color}
        strokeWidth={STRAIGHT_WIDTH}
        strokeLinecap="round"
      />
    );
  }
  if (edge.kind === "merge") {
    const xFrom = laneX(edge.fromLane);
    const xTo = laneX(edge.toLane);
    const c1y = midY * 0.55;
    return (
      <path
        key={`t-m-${edge.fromLane}-${edge.toLane}`}
        d={`M ${xFrom} 0 C ${xFrom} ${c1y}, ${xTo} ${c1y}, ${xTo} ${midY}`}
        fill="none"
        stroke={edge.color}
        strokeWidth={CURVE_WIDTH}
        strokeLinecap="round"
      />
    );
  }
  return null;
}

function renderBottomEdge(
  edge: GraphEdge,
  midY: number,
  bottomY: number,
): ReactElement | null {
  if (edge.kind === "straight") {
    const x = laneX(edge.lane);
    return (
      <line
        key={`b-s-${edge.lane}`}
        x1={x}
        y1={midY}
        x2={x}
        y2={bottomY}
        stroke={edge.color}
        strokeWidth={STRAIGHT_WIDTH}
        strokeLinecap="round"
      />
    );
  }
  if (edge.kind === "branch") {
    const xFrom = laneX(edge.fromLane);
    const xTo = laneX(edge.toLane);
    const c1y = midY + (bottomY - midY) * 0.45;
    return (
      <path
        key={`b-b-${edge.fromLane}-${edge.toLane}`}
        d={`M ${xFrom} ${midY} C ${xFrom} ${c1y}, ${xTo} ${c1y}, ${xTo} ${bottomY}`}
        fill="none"
        stroke={edge.color}
        strokeWidth={CURVE_WIDTH}
        strokeLinecap="round"
      />
    );
  }
  return null;
}

export const GraphRail = memo(function GraphRail({
  row,
  rowHeight,
  maxLaneCount,
  active,
}: Props) {
  const width = railWidth(maxLaneCount);
  const midY = Math.round(rowHeight / 2);
  const nodeX = laneX(row.lane);

  const visible = Math.min(maxLaneCount, MAX_VISIBLE_LANES);
  const overflow = row.laneCount > visible;

  return (
    <svg
      width={width}
      height={rowHeight}
      viewBox={`0 0 ${width} ${rowHeight}`}
      aria-hidden
      className="shrink-0 overflow-visible"
    >
      {row.topEdges.map((e) => renderTopEdge(e, midY))}
      {row.bottomEdges.map((e) => renderBottomEdge(e, midY, rowHeight))}
      {/* Commit node */}
      <circle
        cx={nodeX}
        cy={midY}
        r={active ? 5.5 : 4.5}
        fill={row.nodeColor}
        stroke="var(--background)"
        strokeWidth={1.5}
      />
      {active ? (
        <circle
          cx={nodeX}
          cy={midY}
          r={7.5}
          fill="none"
          stroke={row.nodeColor}
          strokeOpacity={0.35}
          strokeWidth={1.4}
        />
      ) : null}
      {overflow ? (
        <text
          x={width - 4}
          y={midY + 3}
          textAnchor="end"
          className="fill-muted-foreground"
          style={{ fontSize: 8 }}
        >
          +{row.laneCount - visible}
        </text>
      ) : null}
    </svg>
  );
});
