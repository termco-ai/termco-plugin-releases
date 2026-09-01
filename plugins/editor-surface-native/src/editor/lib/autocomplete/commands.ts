/**
 * Keymap command handlers for the active ghost suggestion: accept the whole
 * suggestion, accept the next word, or dismiss it.
 *
 * Each returns `true` when it handled the key (a suggestion was present) so the
 * bound keys fall through to their defaults when there is nothing to accept.
 */
import type { EditorView } from "@codemirror/view";
import { setSuggestion, suggestionField } from "./suggestionState";

/** Insert the full suggestion and clear the ghost. */
export function acceptSuggestion(view: EditorView): boolean {
  const sug = view.state.field(suggestionField, false);
  if (!sug) return false;
  view.dispatch({
    changes: { from: sug.from, to: sug.from, insert: sug.text },
    selection: { anchor: sug.from + sug.text.length },
    effects: setSuggestion.of(null),
    userEvent: "input.complete.ai",
  });
  return true;
}

/** Insert only the next word/punctuation chunk, keeping the remainder as ghost. */
export function acceptWord(view: EditorView): boolean {
  const sug = view.state.field(suggestionField, false);
  if (!sug) return false;
  // Take the next contiguous chunk: leading whitespace + one word OR one
  // punctuation run. Falls back to whole-suggestion if nothing matches.
  const m =
    sug.text.match(/^\s*[\w$]+/) ??
    sug.text.match(/^\s*[^\w\s$]+/) ??
    sug.text.match(/^\s+/);
  if (!m) return acceptSuggestion(view);
  const chunk = m[0];
  const remaining = sug.text.slice(chunk.length);
  view.dispatch({
    changes: { from: sug.from, to: sug.from, insert: chunk },
    selection: { anchor: sug.from + chunk.length },
    effects: setSuggestion.of(
      remaining ? { from: sug.from + chunk.length, text: remaining } : null,
    ),
    userEvent: "input.complete.ai",
  });
  return true;
}

/** Clear the active ghost suggestion without inserting anything. */
export function dismissSuggestion(view: EditorView): boolean {
  const sug = view.state.field(suggestionField, false);
  if (!sug) return false;
  view.dispatch({ effects: setSuggestion.of(null) });
  return true;
}
