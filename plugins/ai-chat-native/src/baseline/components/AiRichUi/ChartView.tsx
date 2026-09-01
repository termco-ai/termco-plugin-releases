/**
 * The chart view. Its own module because recharts is heavy — `RichView` pulls
 * it in with `React.lazy`, so a transcript without charts never loads it.
 *
 * The model gives us series of `{x, y}` points; recharts wants one row per x
 * with a column per series, so we pivot here. Colours come from the theme's
 * `--chart-1..5` tokens, which the app already defines for light and dark.
 */

import {
  type ChartConfig,
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
} from "@termco/ui";
import { memo, useMemo } from "react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  XAxis,
  YAxis,
} from "recharts";
import type { ViewSpec } from "./types";

type ChartSpec = Extract<ViewSpec, { kind: "chart" }>;

/** Stable, readable key per series — recharts needs an identifier, and the
 * model's series names may contain anything. */
const seriesKey = (index: number) => `s${index}`;

const ChartView = memo(function ChartView({
  view,
}: {
  view: ChartSpec;
}) {
  const { rows, config } = useMemo(() => {
    const byX = new Map<string | number, Record<string, string | number>>();
    const cfg: ChartConfig = {};
    view.series.forEach((s, i) => {
      const key = seriesKey(i);
      cfg[key] = { label: s.name, color: `var(--chart-${(i % 5) + 1})` };
      for (const p of s.points) {
        const row = byX.get(p.x) ?? { x: p.x };
        row[key] = p.y;
        byX.set(p.x, row);
      }
    });
    return { rows: Array.from(byX.values()), config: cfg };
  }, [view.series]);

  const keys = view.series.map((_, i) => seriesKey(i));
  const showLegend = view.series.length > 1;

  const axes = (
    <>
      <CartesianGrid vertical={false} strokeDasharray="3 3" />
      <XAxis
        dataKey="x"
        tickLine={false}
        axisLine={false}
        tickMargin={6}
        fontSize={10}
      />
      <YAxis tickLine={false} axisLine={false} width={32} fontSize={10} />
      <ChartTooltip content={<ChartTooltipContent />} />
      {showLegend ? <ChartLegend content={<ChartLegendContent />} /> : null}
    </>
  );

  return (
    <div className="px-2 py-2">
      {/* `aspect-auto` cancels ChartContainer's own `aspect-video`: a pinned
          height and an aspect ratio would otherwise both claim to size the box,
          which is unpredictable in the narrow dock. */}
      <ChartContainer config={config} className="aspect-auto h-48 w-full">
        {view.chart === "bar" ? (
          <BarChart data={rows}>
            {axes}
            {keys.map((k) => (
              <Bar
                key={k}
                dataKey={k}
                fill={`var(--color-${k})`}
                radius={2}
                isAnimationActive={false}
              />
            ))}
          </BarChart>
        ) : view.chart === "area" ? (
          <AreaChart data={rows}>
            {axes}
            {keys.map((k) => (
              <Area
                key={k}
                dataKey={k}
                type="monotone"
                stroke={`var(--color-${k})`}
                fill={`var(--color-${k})`}
                fillOpacity={0.2}
                strokeWidth={2}
                isAnimationActive={false}
              />
            ))}
          </AreaChart>
        ) : (
          <LineChart data={rows}>
            {axes}
            {keys.map((k) => (
              <Line
                key={k}
                dataKey={k}
                type="monotone"
                stroke={`var(--color-${k})`}
                strokeWidth={2}
                dot={false}
                isAnimationActive={false}
              />
            ))}
          </LineChart>
        )}
      </ChartContainer>
      {view.xLabel || view.yLabel ? (
        <div className="mt-1 flex justify-between text-xs text-muted-foreground/70">
          <span>{view.xLabel ?? ""}</span>
          <span>{view.yLabel ?? ""}</span>
        </div>
      ) : null}
    </div>
  );
});

export default ChartView;
