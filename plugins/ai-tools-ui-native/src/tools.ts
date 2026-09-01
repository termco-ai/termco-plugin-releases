import type { AiToolContribution, AiToolEntry } from "@termco/ai-tools-base";
import { askUiInputSchema, showUiInputSchema } from "./schema";
import { askUiPresentation, showUiPresentation } from "./presentation";

export const SHOW_UI_TOOL_NAME = "show_ui";
export const ASK_UI_TOOL_NAME = "ask_ui";

const VIEW_GUIDE = `Pick the view that matches the data:
- table: comparable records; add a file ref to make a row clickable.
- findings: actionable problems with severity.
- chart: numbers over a dimension, never a few values better written as prose.
- diff: one file as a patch or before/after.
- tree: a hierarchy represented as a flat list with depth.
- metrics: a handful of headline numbers.
- cards: short prose blocks that belong side by side.`;

function values(input: unknown): Record<string, unknown> {
  return input && typeof input === "object" ? input as Record<string, unknown> : {};
}

export function viewItemCount(view: unknown): number {
  const record = values(view);
  if (record.kind === "diff") return 1;
  if (record.kind === "table" && Array.isArray(record.rows)) return record.rows.length;
  if (record.kind === "tree" && Array.isArray(record.nodes)) return record.nodes.length;
  if (record.kind === "chart" && Array.isArray(record.series)) {
    return record.series.reduce((total, series) => {
      const points = values(series).points;
      return total + (Array.isArray(points) ? points.length : 0);
    }, 0);
  }
  return Array.isArray(record.items) ? record.items.length : 0;
}

export function createUiTools(): Record<string, AiToolEntry> {
  return {
    [SHOW_UI_TOOL_NAME]: {
      description: `Render a rich view in chat when the shape of the data carries meaning. Keep explanation and reasoning in normal prose, use one view per point, and do not repeat the same data afterwards.\n\n${VIEW_GUIDE}`,
      inputSchema: showUiInputSchema,
      execute: async (input) => {
        const view = values(input).view;
        return {
          ok: true,
          kind: values(view).kind,
          items: viewItemCount(view),
        };
      },
    },
    [ASK_UI_TOOL_NAME]: {
      description: `Render a rich view and wait for the user to choose an action. Use it only when the next step depends on that decision. Offer 2–4 actions, mark exactly one recommended, and do not call another tool in the same step.\n\n${VIEW_GUIDE}`,
      inputSchema: askUiInputSchema,
    },
  };
}

export function createUiToolContribution(): AiToolContribution {
  return {
    id: "ui",
    group: "ui",
    order: 170,
    presentations: {
      [SHOW_UI_TOOL_NAME]: showUiPresentation,
      [ASK_UI_TOOL_NAME]: askUiPresentation,
    },
    build: () => createUiTools(),
  };
}
