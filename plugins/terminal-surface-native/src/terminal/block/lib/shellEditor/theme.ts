import { terminalPalette } from "../../../../terminalTheme";
import { HighlightStyle } from "@codemirror/language";
import { EditorView } from "@codemirror/view";
import { tags as t } from "@lezer/highlight";

// Map legacy-shell token styles to the live terminal palette so the input
// line is colored by the same theme the terminal grid uses.
export function highlightStyle(): HighlightStyle {
  const c = terminalPalette();
  const fg = c.foreground ?? "inherit";
  return HighlightStyle.define([
    { tag: t.keyword, color: c.magenta ?? fg },
    { tag: t.string, color: c.green ?? fg },
    { tag: t.comment, color: c.brightBlack ?? fg, fontStyle: "italic" },
    { tag: [t.number, t.bool, t.atom], color: c.yellow ?? fg },
    { tag: t.standard(t.variableName), color: c.cyan ?? fg },
    { tag: t.special(t.variableName), color: c.blue ?? fg },
    { tag: t.variableName, color: fg },
    { tag: t.operator, color: c.brightBlack ?? fg },
  ]);
}

export function baseTheme(fontFamily: string, fontSize: number) {
  const c = terminalPalette();
  const caret = c.cursor ?? c.foreground ?? "currentColor";
  return EditorView.theme({
    "&": {
      backgroundColor: "transparent",
      color: c.foreground ?? "inherit",
      fontSize: `${fontSize}px`,
      minHeight: "1.5em",
    },
    ".cm-content": {
      padding: "0 2px",
      fontFamily,
      caretColor: caret,
      lineHeight: "1.5",
      minHeight: "1.5em",
    },
    ".cm-line": { padding: "0", lineHeight: "1.5", minHeight: "1.5em" },
    ".cm-scroller": {
      fontFamily,
      lineHeight: "1.5",
      overflow: "auto",
      minHeight: "1.5em",
      maxHeight: "200px",
    },
    "&.cm-focused": { outline: "none" },
    ".cm-cursor, .cm-dropCursor": { borderLeftColor: caret },
    "&.cm-focused .cm-selectionBackground, .cm-selectionBackground, .cm-content ::selection":
      { backgroundColor: c.selectionBackground ?? "rgba(255,255,255,0.15)" },
    ".cm-placeholder": { color: "rgba(128,128,128,0.5)" },
    ".cm-ghost": { opacity: "0.4" },
    ".cm-tooltip": {
      backgroundColor: "var(--popover)",
      color: "var(--popover-foreground)",
      border: "1px solid var(--border)",
      borderRadius: "8px",
      overflow: "hidden",
      boxShadow: "0 8px 24px rgba(0,0,0,0.25)",
    },
    ".cm-tooltip-autocomplete > ul": { fontFamily, maxHeight: "16rem" },
    ".cm-tooltip-autocomplete > ul > li": { padding: "2px 8px" },
    ".cm-tooltip-autocomplete ul li[aria-selected]": {
      backgroundColor: "var(--accent, rgba(127,127,127,0.2))",
      color: "var(--accent-foreground, inherit)",
    },
    ".cm-completionIcon": { paddingRight: "0.6em", opacity: "0.7" },
  });
}
