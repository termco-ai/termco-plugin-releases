/** Renderer-owned view model. Validation and normalization stay in the
 * selected `ai.tools` provider's presentation adapter. */
export type FileRefSpec = {
  file: string;
  line?: number;
  column?: number;
};

export type SeverityLevel = "error" | "warning" | "info" | "success";

type ViewBase = { title?: string };

export type ViewSpec =
  | (ViewBase & {
      kind: "table";
      columns: Array<{
        key: string;
        label: string;
        align?: "left" | "right";
        mono?: boolean;
      }>;
      rows: Array<{
        cells: Record<string, string | number | boolean>;
        ref?: FileRefSpec;
      }>;
    })
  | (ViewBase & {
      kind: "chart";
      chart: "bar" | "line" | "area";
      xLabel?: string;
      yLabel?: string;
      series: Array<{
        name: string;
        points: Array<{ x: string | number; y: number }>;
      }>;
    })
  | (ViewBase & {
      kind: "diff";
      path?: string;
      patch?: string;
      before?: string;
      after?: string;
    })
  | (ViewBase & {
      kind: "findings";
      items: Array<{
        severity: SeverityLevel;
        message: string;
        detail?: string;
        ref?: FileRefSpec;
      }>;
    })
  | (ViewBase & {
      kind: "tree";
      nodes: Array<{
        label: string;
        depth: number;
        isDir?: boolean;
        note?: string;
        ref?: FileRefSpec;
      }>;
    })
  | (ViewBase & {
      kind: "metrics";
      items: Array<{
        label: string;
        value: string | number;
        hint?: string;
        severity?: SeverityLevel;
      }>;
    })
  | (ViewBase & {
      kind: "cards";
      items: Array<{
        title: string;
        body?: string;
        badge?: string;
        severity?: SeverityLevel;
        ref?: FileRefSpec;
      }>;
    });

export type ViewKind = ViewSpec["kind"];

export type UiAction = {
  id: string;
  label: string;
  description?: string;
  recommended?: boolean;
  variant?: "default" | "ghost" | "destructive";
};

export type AskUiOutput = {
  actionId: string | null;
  label: string;
  note?: string;
  selected?: string[];
  dismissed?: boolean;
};

export function viewItemCount(view: ViewSpec): number {
  switch (view.kind) {
    case "table": return view.rows.length;
    case "chart": return view.series.reduce(
      (count, series) => count + series.points.length,
      0,
    );
    case "diff": return 1;
    case "tree": return view.nodes.length;
    default: return view.items.length;
  }
}
