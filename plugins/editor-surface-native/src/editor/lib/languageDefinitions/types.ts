import type { Extension } from "@codemirror/state";

/**
 * Language definition types for the editor's on-demand CodeMirror language
 * support. Extracted from the former single `languageDefinitions.ts`.
 */

/** Lazily resolves a CodeMirror language `Extension` when a file needs it. */
type LanguageLoader = () => Promise<Extension>;

/** A supported language: display name, matching extensions/filenames, and the
 *  lazy loader that yields its CodeMirror extension. */
export interface LanguageDefinition {
  name: string;
  extensions: string[];
  loader: LanguageLoader;

  filenames?: string[];
  userSelectable?: boolean;
}
