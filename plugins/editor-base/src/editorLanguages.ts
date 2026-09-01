export interface EditorLanguageChoice {
  name: string;
  ext: string;
}

/** Read-only language metadata shared by editor-owned UI and consumers such
 * as the header's exact tab language popover. Language loaders remain private
 * to the selected editor plugin. */
export interface EditorLanguagesCapability {
  all(): readonly EditorLanguageChoice[];
  common(): readonly EditorLanguageChoice[];
  displayName(filename: string | null): string;
}
