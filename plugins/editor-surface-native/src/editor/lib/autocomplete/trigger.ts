/**
 * The gate that decides whether an inline completion should be requested for
 * the current editor state — pure predicates over prefs and cursor context.
 */
import type { EditorState } from "@codemirror/state";
import { MIN_PREFIX_CHARS } from "./constants";
import type { AutocompletePrefs } from "./types";

/** Whether Settings identifies a model for the selected shared provider. */
export function hasConfiguredModel(prefs: AutocompletePrefs): boolean {
  return Boolean(prefs.modelId.trim());
}

/**
 * Decide whether to trigger a completion. Manual triggers only require a
 * collapsed selection and a configured provider; automatic triggers also avoid
 * mid-identifier positions and demand a little recent context.
 */
export function shouldTrigger(
  state: EditorState,
  prefs: AutocompletePrefs,
  isManual: boolean,
): boolean {
  if (!prefs.enabled) return false;
  if (!hasConfiguredModel(prefs)) return false;
  const sel = state.selection.main;
  if (sel.from !== sel.to) return false;
  if (isManual) return true;

  const cursor = sel.from;
  const doc = state.doc;
  if (doc.length === 0) return false;

  // Skip if cursor is in the middle of an identifier — typing ghost mid-word
  // is the most disruptive failure mode.
  if (cursor < doc.length) {
    const next = doc.sliceString(cursor, cursor + 1);
    if (next && /[\w$]/.test(next)) return false;
  }

  // Require some non-whitespace context within the recent prefix window.
  const recent = doc.sliceString(Math.max(0, cursor - 200), cursor);
  if (recent.replace(/\s/g, "").length < MIN_PREFIX_CHARS) return false;

  return true;
}
