/**
 * Public API of the editor language-definitions module.
 *
 * Replaces the former single `languageDefinitions.ts`; definitions now live in
 * `types`, `loader`, `languages`, and `tables`, re-exported here so
 * `@/modules/editor/lib/languageDefinitions` importers are unchanged.
 */

;
export {
  ALL_LANGUAGES,
  EXPOSED_LANGUAGES,
  extensionMap,
  filenameMap,
} from "./tables";
export type { LanguageDefinition } from "./types";
