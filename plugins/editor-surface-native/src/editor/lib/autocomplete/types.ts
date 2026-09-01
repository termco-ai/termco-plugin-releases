/**
 * Shared types for the inline AI-autocomplete CodeMirror extension.
 *
 * Kept in one place so the extension wiring, driver, and command handlers all
 * agree on the shape of the ghost-suggestion state and the host-provided
 * context callbacks.
 */
import type { CompletionDeps } from "./provider";

/** Editor preferences that decide whether and how a completion is requested. */
export type AutocompletePrefs = CompletionDeps & {
  enabled: boolean;
};

/**
 * Callbacks the host editor supplies so the extension can read live prefs and
 * document metadata without owning that state itself.
 */
export type AutocompleteContext = {
  getPrefs: () => AutocompletePrefs;
  getPath: () => string | null;
  getLanguage: () => string | null;
};

/** A pending ghost suggestion: `text` to be shown starting at document offset `from`. */
export type Suggestion = {
  from: number;
  text: string;
};
