/**
 * Presentation constants for the AI diff pane: the CodeMirror changed-text
 * theme and the status-badge label/variant lookups.
 */
import type { AiDiffStatus } from "../../tabTypes";
import { EditorView } from "@codemirror/view";

export const DIFF_THEME = EditorView.theme({
  // Side-by-side: the left column is the previous version, so its changes read
  // as removals; the right column reads as additions. See gitDiffTheme.ts.
  "&.cm-merge-a .cm-changedLine, &.cm-merge-a .cm-inlineChangedLine": {
    backgroundColor: "rgba(220, 90, 90, 0.16) !important",
  },
  "&.cm-merge-b .cm-changedLine, &.cm-merge-b .cm-inlineChangedLine": {
    backgroundColor: "rgba(110, 200, 120, 0.16) !important",
  },
  "&.cm-merge-a .cm-changedText": {
    background: "rgba(220, 90, 90, 0.34) !important",
  },
  "&.cm-merge-b .cm-changedText": {
    background: "rgba(110, 200, 120, 0.34) !important",
  },
  "&.cm-merge-a .cm-changedLineGutter": {
    background: "rgba(220, 90, 90, 0.75) !important",
  },
  "&.cm-merge-b .cm-changedLineGutter": {
    background: "rgba(110, 200, 120, 0.75) !important",
  },
  ".cm-mergeSpacer": {
    background:
      "repeating-linear-gradient(45deg, rgba(128,128,128,0.10) 0 6px, transparent 6px 12px)",
  },
  ".cm-mergeViewEditor": { minWidth: "0" },
  // ".cm-changedLine": {
  //   backgroundColor:
  //     "color-mix(in srgb, #22c55e 10%, transparent) !important",
  // },
  // ".cm-merge-b .cm-changedText, .cm-merge-b ins.cm-insertedLine": {
  //   background:
  //     "color-mix(in srgb, #22c55e 28%, transparent) !important",
  //   textDecoration: "none !important",
  //   borderRadius: "2px",
  // },
  // ".cm-deletedChunk": {
  //   backgroundColor:
  //     "color-mix(in srgb, #ef4444 8%, transparent)",
  //   paddingLeft: "6px",
  //   paddingTop: "1px",
  //   paddingBottom: "1px",
  // },
  // ".cm-deletedChunk .cm-deletedText, .cm-deletedLine del": {
  //   background:
  //     "color-mix(in srgb, #ef4444 26%, transparent) !important",
  //   textDecoration: "none !important",
  //   borderRadius: "2px",
  // },
  // ".cm-changeGutter": {
  //   width: "3px",
  // },
  // ".cm-changedLineGutter": {
  //   backgroundColor: "#22c55e",
  // },
  // ".cm-deletedLineGutter": {
  //   backgroundColor: "#ef4444",
  // },
  ".cm-changedText": {
    background: "#88ff881a !important",
  },
});

export const STATUS_LABEL: Record<AiDiffStatus, string> = {
  pending: "Pending review",
  approved: "Applied",
  rejected: "Rejected",
};

export const STATUS_CHIP_CLASS: Record<AiDiffStatus, string> = {
  pending: "bg-yellow-500/15 text-yellow-500",
  approved: "bg-chart-5/15 text-chart-5",
  rejected: "bg-destructive/15 text-destructive",
};
