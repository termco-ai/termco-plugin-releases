import { LANGUAGES } from "./languages";
import type { LanguageDefinition } from "./types";

/**
 * Derived lookup tables over `LANGUAGES`: the alphabetical and user-selectable
 * name lists, and the extension/filename → definition maps. Extracted from the
 * former single `languageDefinitions.ts`; derivation logic unchanged.
 */

/** All languages, alphabetised, as `{ name, ext }` for pickers. */
export const ALL_LANGUAGES = [...LANGUAGES]
  .sort((a, b) => a.name.localeCompare(b.name))
  .map((l) => ({ name: l.name, ext: l.extensions[0] }));

/** User-selectable languages only, as `{ name, ext }` for the language menu. */
export const EXPOSED_LANGUAGES = LANGUAGES.filter((l) => l.userSelectable).map(
  (l) => ({ name: l.name, ext: l.extensions[0] }),
);

/** Lower-cased file-extension → language definition. */
export const extensionMap = new Map<string, LanguageDefinition>();
/** Lower-cased whole-filename → language definition. */
export const filenameMap = new Map<string, LanguageDefinition>();

for (const lang of LANGUAGES) {
  lang.extensions?.forEach((ext) => {
    extensionMap.set(ext.toLowerCase(), lang);
  });
  lang.filenames?.forEach((file) => {
    filenameMap.set(file.toLowerCase(), lang);
  });
}
