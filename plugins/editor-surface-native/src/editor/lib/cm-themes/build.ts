/**
 * Shared builder for the editor's locally-defined CodeMirror color themes.
 *
 * Every theme in this folder is expressed as a flat {@link Palette} of syntax
 * colors and turned into a CodeMirror {@link Extension} by {@link build}. The
 * per-theme data files (`kanagawa.ts`, `dracula.ts`, …) each import this builder
 * and are re-exported through the folder barrel.
 */
import type { Extension } from "@codemirror/state";
import { tags as t } from "@lezer/highlight";
import { createTheme } from "@uiw/codemirror-themes";

// Syntax palette shared by every locally-defined theme. The editor renders as
// glass over the app surface, so `background`/`selection`/`caret` here are
// overridden by buildSharedExtensions() — only the syntax colors really land.
export type Palette = {
  mode: "light" | "dark";
  bg: string;
  fg: string;
  caret: string;
  selection: string;
  lineHighlight: string;
  gutterFg: string;
  comment: string;
  keyword: string;
  boldKeyword?: boolean;
  string: string;
  number: string;
  /** Booleans / language constants / atoms. Falls back to `number`. */
  constant?: string;
  func: string;
  variable: string;
  property: string;
  type: string;
  operator: string;
  tag: string;
  attr: string;
  heading: string;
  link: string;
  invalid: string;
};

/** Compile a {@link Palette} into a ready-to-use CodeMirror theme extension. */
export function build(p: Palette): Extension {
  return createTheme({
    theme: p.mode,
    settings: {
      background: p.bg,
      foreground: p.fg,
      caret: p.caret,
      selection: p.selection,
      selectionMatch: p.selection,
      lineHighlight: p.lineHighlight,
      gutterBackground: p.bg,
      gutterForeground: p.gutterFg,
    },
    styles: [
      {
        tag: [t.comment, t.lineComment, t.blockComment, t.docComment],
        color: p.comment,
        fontStyle: "italic",
      },
      {
        tag: [
          t.keyword,
          t.modifier,
          t.controlKeyword,
          t.operatorKeyword,
          t.moduleKeyword,
          t.self,
        ],
        color: p.keyword,
        ...(p.boldKeyword ? { fontWeight: "bold" } : {}),
      },
      {
        tag: [t.string, t.special(t.string), t.regexp, t.character],
        color: p.string,
      },
      { tag: [t.number], color: p.number },
      {
        tag: [t.bool, t.null, t.atom, t.constant(t.name)],
        color: p.constant ?? p.number,
      },
      {
        tag: [
          t.function(t.variableName),
          t.function(t.propertyName),
          t.labelName,
          t.macroName,
        ],
        color: p.func,
      },
      {
        tag: [
          t.definition(t.variableName),
          t.variableName,
          t.local(t.variableName),
        ],
        color: p.variable,
      },
      { tag: [t.propertyName, t.special(t.propertyName)], color: p.property },
      {
        tag: [t.typeName, t.className, t.namespace, t.changed, t.annotation],
        color: p.type,
      },
      {
        tag: [
          t.operator,
          t.punctuation,
          t.separator,
          t.bracket,
          t.derefOperator,
        ],
        color: p.operator,
      },
      { tag: [t.tagName, t.angleBracket], color: p.tag },
      { tag: [t.attributeName, t.attributeValue], color: p.attr },
      { tag: [t.heading], color: p.heading, fontWeight: "bold" },
      { tag: [t.link, t.url], color: p.link, textDecoration: "underline" },
      { tag: [t.emphasis], fontStyle: "italic" },
      { tag: [t.strong], fontWeight: "bold" },
      { tag: [t.invalid], color: p.invalid },
      { tag: [t.meta, t.processingInstruction], color: p.comment },
    ],
  });
}
