/**
 * CodeMirror theme for the side-by-side diff, following what VS Code does.
 *
 * Two rules carry the whole thing:
 *
 * - **The side decides the colour.** The left editor (`.cm-merge-a`) holds the
 *   previous version, so its changed lines are red; the right one is green. The
 *   unified view could not express this — there was only one document, and
 *   deleted lines lived beside it as widgets.
 * - **The line is tinted, the changed words are stronger.** A tint you have to
 *   hunt for is worse than none: the previous whole-line value here was 5 %
 *   opacity, which is invisible in practice.
 */
import { EditorView } from "@codemirror/view";

/** Whole-line wash — enough to scan a column and find the changes. */
const LINE_REMOVED = "rgba(220, 90, 90, 0.16)";
const LINE_ADDED = "rgba(110, 200, 120, 0.16)";
/** The changed words themselves, clearly above the line wash. */
const TEXT_REMOVED = "rgba(220, 90, 90, 0.34)";
const TEXT_ADDED = "rgba(110, 200, 120, 0.34)";
/** The edge stripe, saturated because it is only a few pixels wide. */
const GUTTER_REMOVED = "rgba(220, 90, 90, 0.75)";
const GUTTER_ADDED = "rgba(110, 200, 120, 0.75)";

export const DIFF_THEME = EditorView.theme({
  // ---- side by side -------------------------------------------------------
  "&.cm-merge-a .cm-changedLine, &.cm-merge-a .cm-inlineChangedLine": {
    backgroundColor: `${LINE_REMOVED} !important`,
  },
  "&.cm-merge-b .cm-changedLine, &.cm-merge-b .cm-inlineChangedLine": {
    backgroundColor: `${LINE_ADDED} !important`,
  },
  "&.cm-merge-a .cm-changedText": {
    background: `${TEXT_REMOVED} !important`,
    borderRadius: "2px",
  },
  "&.cm-merge-b .cm-changedText": {
    background: `${TEXT_ADDED} !important`,
    borderRadius: "2px",
  },
  "&.cm-merge-a .cm-changedLineGutter": {
    background: `${GUTTER_REMOVED} !important`,
  },
  "&.cm-merge-b .cm-changedLineGutter": {
    background: `${GUTTER_ADDED} !important`,
  },

  // The gap that keeps the two columns aligned. VS Code hatches it — diagonal
  // stripes say "nothing here" without suggesting deleted content.
  ".cm-mergeSpacer": {
    background:
      "repeating-linear-gradient(45deg, rgba(128,128,128,0.10) 0 6px, transparent 6px 12px)",
  },

  // ---- still reachable through the unified view ---------------------------
  ".cm-deletedChunk .cm-deletedText": {
    background: `${TEXT_REMOVED} !important`,
    borderRadius: "2px",
  },
  ".cm-deletedChunk": {
    backgroundColor: `${LINE_REMOVED} !important`,
  },
  ".cm-deletedLineGutter": {
    background: `${GUTTER_REMOVED} !important`,
  },

  // ---- shared -------------------------------------------------------------
  ".cm-changeGutter": {
    width: "3px !important",
    paddingLeft: "0 !important",
  },
  ".cm-collapsedLines": {
    backgroundColor: "transparent",
    color: "var(--muted-foreground, #9ca3af)",
    fontSize: "12px",
    padding: "2px 8px",
    opacity: 0.7,
  },
  // Neither column may push the other out of the pane.
  ".cm-mergeViewEditor": {
    minWidth: "0",
  },
});
