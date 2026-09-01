/**
 * The stateful core of the inline-autocomplete extension: the effect and state
 * field that hold the current ghost suggestion.
 *
 * These are module-level singletons — `setSuggestion` and `suggestionField`
 * must be the *same* identities everywhere (decorations, driver, commands, and
 * the extension array) or CodeMirror will treat them as unrelated state.
 */
import { StateEffect, StateField, type Transaction } from "@codemirror/state";
import type { Suggestion } from "./types";

/** Effect that sets (or clears, with `null`) the active ghost suggestion. */
export const setSuggestion = StateEffect.define<Suggestion | null>();

/**
 * Holds the current ghost suggestion. Cleared on selection changes; on document
 * edits it either consumes typed-ahead characters or drops the suggestion.
 */
export const suggestionField = StateField.define<Suggestion | null>({
  create: () => null,
  update(value, tr) {
    for (const e of tr.effects) {
      if (e.is(setSuggestion)) return e.value;
    }
    if (!value) return value;
    if (tr.docChanged) {
      return consumeIfTypedAhead(value, tr);
    }
    if (tr.selection) return null;
    return value;
  },
});

/**
 * If the user typed characters that match the start of the pending suggestion,
 * shrink the suggestion to the remaining tail; otherwise drop it entirely.
 * Returns the surviving suggestion, or `null` if it can no longer apply.
 */
function consumeIfTypedAhead(
  current: Suggestion,
  tr: Transaction,
): Suggestion | null {
  let consumed: string | null = null;
  let originDelta = 0;
  let abort = false;
  tr.changes.iterChanges((fromA, toA, _fromB, _toB, inserted) => {
    if (abort) return;
    const ins = inserted.toString();
    if (fromA !== toA || fromA !== current.from || !ins) {
      abort = true;
      return;
    }
    if (current.text.startsWith(ins)) {
      consumed = ins;
      originDelta = ins.length;
    } else {
      abort = true;
    }
  });
  if (abort || !consumed) return null;
  const remaining = current.text.slice((consumed as string).length);
  if (!remaining) return null;
  return { from: current.from + originDelta, text: remaining };
}
