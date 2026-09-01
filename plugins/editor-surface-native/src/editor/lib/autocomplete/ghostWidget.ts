/**
 * Rendering for the inline-autocomplete ghost text: the widget, its theme, and
 * the decoration set derived from the active suggestion.
 */
import { Decoration, EditorView, WidgetType } from "@codemirror/view";
import { suggestionField } from "./suggestionState";

/** An inline widget that renders the pending suggestion as dimmed ghost text. */
export class GhostWidget extends WidgetType {
  constructor(readonly text: string) {
    super();
  }
  override eq(other: GhostWidget): boolean {
    return other.text === this.text;
  }
  toDOM(): HTMLElement {
    const span = document.createElement("span");
    span.className = "cm-ai-ghost";
    const lines = this.text.split("\n");
    lines.forEach((line, i) => {
      if (i > 0) span.appendChild(document.createElement("br"));
      span.appendChild(document.createTextNode(line));
    });
    return span;
  }
  override ignoreEvent(): boolean {
    return true;
  }
}

/** Styling for the ghost span: faint, italic, and non-interactive. */
export const ghostTheme = EditorView.theme({
  ".cm-ai-ghost": {
    opacity: "0.45",
    fontStyle: "italic",
    pointerEvents: "none",
  },
});

/** Computes the ghost decoration set from the current `suggestionField`. */
export const ghostDecorations = EditorView.decorations.compute(
  [suggestionField],
  (state) => {
    const sug = state.field(suggestionField);
    if (!sug) return Decoration.none;
    return Decoration.set([
      Decoration.widget({
        widget: new GhostWidget(sug.text),
        side: 1,
      }).range(sug.from),
    ]);
  },
);
