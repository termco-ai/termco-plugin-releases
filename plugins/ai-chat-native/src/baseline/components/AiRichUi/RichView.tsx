/**
 * Dispatch from a `ViewSpec` to the component that draws it, plus the diff
 * card (which reuses the transcript's existing diff engine rather than a
 * second one).
 */

import {
  DiffView,
  lineDiff,
  parsePatch,
} from "../../ai-elements/tool-diff";
import { lazy, memo, Suspense, useMemo } from "react";
import type { ViewSpec } from "./types";
import {
  CardsView,
  FindingsView,
  MetricsView,
  TableView,
  TreeView,
} from "./views";

// recharts is ~100kB of chart engine; only pay for it when a chart shows up.
const ChartView = lazy(() => import("./ChartView"));

type Selection = {
  selected?: Set<string>;
  onToggle?: (label: string) => void;
};

const DiffCard = memo(function DiffCard({
  view,
}: {
  view: Extract<ViewSpec, { kind: "diff" }>;
}) {
  const lines = useMemo(() => {
    if (view.patch) return parsePatch(view.patch);
    if (view.before !== undefined || view.after !== undefined) {
      return lineDiff(view.before ?? "", view.after ?? "");
    }
    return [];
  }, [view.patch, view.before, view.after]);

  if (lines.length === 0) {
    return (
      <div className="px-2.5 py-2 text-xs text-muted-foreground">
        Nothing changed.
      </div>
    );
  }
  return (
    <div className="p-2">
      <DiffView lines={lines} path={view.path} />
    </div>
  );
});

export const RichView = memo(function RichView({
  view,
  selection,
}: {
  view: ViewSpec;
  selection?: Selection;
}) {
  switch (view.kind) {
    case "table":
      return <TableView view={view} selection={selection} />;
    case "findings":
      return <FindingsView view={view} selection={selection} />;
    case "tree":
      return <TreeView view={view} />;
    case "metrics":
      return <MetricsView view={view} />;
    case "cards":
      return <CardsView view={view} selection={selection} />;
    case "diff":
      return <DiffCard view={view} />;
    case "chart":
      return (
        <Suspense
          fallback={
            <div className="px-2.5 py-6 text-center text-xs text-muted-foreground">
              Drawing the chart…
            </div>
          }
        >
          <ChartView view={view} />
        </Suspense>
      );
  }
});
