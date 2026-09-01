/**
 * Extensible registry of rich block widgets. A widget either REPLACES a
 * finished block's terminal rows (ls → file chips, git status → diff
 * rows) or AUGMENTS them with extra content below the real output
 * (dev-server URL pill). New widgets register a matcher + component here;
 * nothing else in the pipeline needs to change.
 */
import type { WorkspaceEnv } from "../../../runtime";
import type { ComponentType } from "react";

export type BlockWidgetContext = {
  command: string;
  cwd: string;
  exitCode: number | null;
  /** The env of the terminal this block ran in (local vs a specific ssh host) —
   * widgets must read fs/git against THIS backend, not the global active env. */
  env: WorkspaceEnv;
  /** Lazily reads the block's full plain-text output from the buffer. */
  readOutput: () => string;
};

export type BlockWidgetProps = {
  ctx: BlockWidgetContext;
  /** Whatever the matcher returned. */
  data: unknown;
  /**
   * Escape hatch for widgets whose data source turns out empty or fails:
   * the block falls back to its plain terminal rows.
   */
  onEmpty: () => void;
};

export type BlockWidgetSpec = {
  id: string;
  /** "replace" hides the block's rows; "augment" renders below them. */
  mode: "replace" | "augment";
  /** Return match data (truthy) to claim the block, null to pass. */
  match(ctx: BlockWidgetContext): unknown | null;
  component: ComponentType<BlockWidgetProps>;
};

const widgets: BlockWidgetSpec[] = [];

export function registerBlockWidget(spec: BlockWidgetSpec): void {
  widgets.push(spec);
}

/** First matching replace-mode widget (its rows are hidden), if any. */
export function matchReplaceWidget(
  ctx: BlockWidgetContext,
): { spec: BlockWidgetSpec; data: unknown } | null {
  for (const spec of widgets) {
    if (spec.mode !== "replace") continue;
    const data = spec.match(ctx);
    if (data !== null) return { spec, data };
  }
  return null;
}

/** All matching augment-mode widgets, rendered under the real rows. */
export function matchAugmentWidgets(
  ctx: BlockWidgetContext,
): Array<{ spec: BlockWidgetSpec; data: unknown }> {
  const out: Array<{ spec: BlockWidgetSpec; data: unknown }> = [];
  for (const spec of widgets) {
    if (spec.mode !== "augment") continue;
    const data = spec.match(ctx);
    if (data !== null) out.push({ spec, data });
  }
  return out;
}
