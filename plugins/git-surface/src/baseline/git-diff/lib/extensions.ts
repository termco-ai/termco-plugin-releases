import { detectMonoFontFamily } from "../fonts";
import {
  HighlightStyle,
  indentUnit,
  syntaxHighlighting,
} from "@codemirror/language";
import { lintGutter } from "@codemirror/lint";
import { search } from "@codemirror/search";
import { Compartment, EditorState, type Extension } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { tags as t } from "@lezer/highlight";

// Compartments allow runtime reconfiguration without rebuilding state.
export const languageCompartment = new Compartment();
export const readOnlyCompartment = new Compartment();
export const wrapCompartment = new Compartment();
export const vimCompartment = new Compartment();
// Holds the popup-completion config: word-based by default, swapped to the
// LSP source while a language-server session is active for the file.
export const completionCompartment = new Compartment();

/**
 * Fallback syntax nuances: many bundled themes only color a handful of token
 * categories, which reads "flat" next to VS Code. These class-based rules
 * apply ONLY for tags the active theme doesn't style itself
 * (`{fallback: true}`), so no theme is overridden — LSP semantic tokens then
 * layer on top for the languages that have a server.
 */
const fallbackHighlight = HighlightStyle.define(
  [
    { tag: [t.function(t.variableName), t.function(t.propertyName)], class: "cm-hlf-function" },
    { tag: [t.propertyName, t.attributeName], class: "cm-hlf-property" },
    { tag: [t.typeName, t.className, t.namespace], class: "cm-hlf-type" },
    { tag: [t.constant(t.variableName), t.standard(t.variableName)], class: "cm-hlf-constant" },
    { tag: [t.definition(t.variableName), t.variableName], class: "cm-hlf-variable" },
    { tag: t.number, class: "cm-hlf-number" },
    { tag: t.regexp, class: "cm-hlf-regexp" },
    { tag: t.tagName, class: "cm-hlf-tag" },
    { tag: t.angleBracket, class: "cm-hlf-bracket" },
  ],
);

const fallbackHighlightTheme = EditorView.baseTheme({
  "&dark .cm-hlf-function": { color: "#DCDCAA" },
  "&dark .cm-hlf-property": { color: "#9CDCFE" },
  "&dark .cm-hlf-type": { color: "#4EC9B0" },
  "&dark .cm-hlf-constant": { color: "#4FC1FF" },
  "&dark .cm-hlf-variable": { color: "#9CDCFE" },
  "&dark .cm-hlf-number": { color: "#B5CEA8" },
  "&dark .cm-hlf-regexp": { color: "#D16969" },
  "&dark .cm-hlf-tag": { color: "#569CD6" },
  "&dark .cm-hlf-bracket": { color: "#808080" },
  "&light .cm-hlf-function": { color: "#795E26" },
  "&light .cm-hlf-property": { color: "#001080" },
  "&light .cm-hlf-type": { color: "#267F99" },
  "&light .cm-hlf-constant": { color: "#0070C1" },
  "&light .cm-hlf-variable": { color: "#001080" },
  "&light .cm-hlf-number": { color: "#098658" },
  "&light .cm-hlf-regexp": { color: "#811F3F" },
  "&light .cm-hlf-tag": { color: "#800000" },
  "&light .cm-hlf-bracket": { color: "#808080" },
});

// Only what basicSetup doesn't already cover, to avoid duplicate extensions.
// basicSetup gives us line numbers, fold gutter, history, indentOnInput,
// bracketMatching, closeBrackets, autocompletion, highlightActiveLine,
// highlightSelectionMatches and the search keymap.
export function buildSharedExtensions(): Extension[] {
  return [
    indentUnit.of("  "),
    EditorState.tabSize.of(2),
    search({ top: true }),
    lintGutter(),
    syntaxHighlighting(fallbackHighlight, { fallback: true }),
    fallbackHighlightTheme,
    EditorView.theme({
      "&, &.cm-editor, &.cm-editor.cm-focused": {
        backgroundColor: "transparent !important",
        color: "var(--foreground)",
        outline: "none",
        padding: "8px",
      },
      ".cm-scroller": {
        fontFamily: detectMonoFontFamily(),
        fontSize: "calc(13px * var(--app-zoom, 1))",
        lineHeight: "1.55",
        backgroundColor: "transparent !important",
      },
      ".cm-content": {
        caretColor: "var(--foreground)",
        backgroundColor: "transparent !important",
      },
      ".cm-gutters": {
        backgroundColor: "transparent !important",
        color: "var(--muted-foreground)",
      },
      // Collapsed until a language server actually produces diagnostics for
      // this editor (docSync toggles the class), so non-LSP files look as before.
      ".cm-gutter-lint": {
        width: "0px",
      },
      "&.cm-lsp-enabled .cm-gutter-lint": {
        width: "1.1em",
      },
      ".cm-gutter": { backgroundColor: "transparent !important" },
      ".cm-lineNumbers .cm-gutterElement": {
        opacity: "0.55",
      },
      ".cm-foldGutter": { width: "10px" },
      ".cm-foldGutter .cm-gutterElement": {
        color: "var(--muted-foreground)",
        opacity: "0.5",
      },
      ".cm-activeLine": {
        borderTopRightRadius: "5px",
        borderBottomRightRadius: "5px",
        backgroundColor:
          "color-mix(in srgb, var(--foreground) 4%, transparent)",
      },
      ".cm-lineNumbers .cm-activeLineGutter": {
        borderTopLeftRadius: "5px",
        borderBottomLeftRadius: "5px",
        userSelect: "none",
      },
      ".cm-cursor, .cm-dropCursor": {
        borderLeftColor: "var(--foreground)",
      },
      // Vim normal-mode block cursor — translucent foreground, no rose hue.
      ".cm-fat-cursor": {
        background:
          "color-mix(in srgb, var(--foreground) 35%, transparent) !important",
        outline:
          "1px solid color-mix(in srgb, var(--foreground) 55%, transparent) !important",
        color: "var(--foreground) !important",
      },
      "&:not(.cm-focused) .cm-fat-cursor": {
        background: "transparent !important",
        outline:
          "1px solid color-mix(in srgb, var(--foreground) 35%, transparent) !important",
      },
      ".cm-selectionBackground, &.cm-focused .cm-selectionBackground, ::selection":
        {
          backgroundColor:
            "color-mix(in srgb, var(--foreground) 18%, transparent) !important",
        },
      ".cm-panels": {
        backgroundColor: "var(--popover)",
        color: "var(--popover-foreground)",
        borderColor: "var(--border)",
      },
      ".cm-panels.cm-panels-top": {
        borderBottom: "1px solid var(--border)",
      },
      // The search/find panel — restyled from CodeMirror's grey defaults to the
      // app's dark, rounded, teal-accented system.
      ".cm-panel.cm-search": {
        display: "flex",
        flexWrap: "wrap",
        alignItems: "center",
        gap: "6px",
        padding: "7px 30px 7px 10px",
        fontSize: "12px",
      },
      ".cm-panel.cm-search .cm-textfield": {
        backgroundColor: "var(--background)",
        border: "1px solid var(--border)",
        borderRadius: "8px",
        padding: "4px 9px",
        margin: "0",
        color: "var(--foreground)",
        fontFamily: detectMonoFontFamily(),
        fontSize: "12px",
        outline: "none",
      },
      ".cm-panel.cm-search .cm-textfield:focus": {
        borderColor: "var(--primary)",
        outline: "none",
      },
      ".cm-panel.cm-search .cm-button": {
        backgroundImage: "none",
        backgroundColor:
          "color-mix(in srgb, var(--foreground) 6%, transparent)",
        border: "1px solid var(--border)",
        borderRadius: "9px",
        padding: "4px 10px",
        color: "var(--foreground)",
        fontFamily: "inherit",
        fontSize: "12px",
        fontWeight: "500",
        cursor: "pointer",
        transition: "background-color 100ms",
      },
      ".cm-panel.cm-search .cm-button:hover": {
        backgroundColor: "var(--accent)",
      },
      ".cm-panel.cm-search .cm-button:active": {
        backgroundImage: "none",
      },
      ".cm-panel.cm-search label": {
        display: "inline-flex",
        alignItems: "center",
        gap: "5px",
        fontSize: "12px",
        color: "var(--muted-foreground)",
      },
      ".cm-panel.cm-search label input[type=checkbox]": {
        accentColor: "var(--primary)",
        width: "13px",
        height: "13px",
        margin: "0",
      },
      ".cm-panel.cm-search [name=close]": {
        top: "0",
        right: "6px",
        color: "var(--muted-foreground)",
        fontSize: "16px",
        lineHeight: "1",
        padding: "2px 6px",
        background: "transparent",
        border: "none",
        cursor: "pointer",
      },
      ".cm-panel.cm-search [name=close]:hover": {
        color: "var(--foreground)",
      },
    }),
  ];
}
