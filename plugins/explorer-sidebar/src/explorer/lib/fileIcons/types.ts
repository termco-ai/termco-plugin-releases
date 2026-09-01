/**
 * Shared value type for the file-icon data shards.
 *
 * Each entry maps an icon-file basename to the language ids, file extensions,
 * and file names that should resolve to that icon.
 */

/** One file-icon association: the tokens that resolve to a single icon basename. */
export type FileIconEntry = {
  languageIds?: Array<string>;
  fileExtensions?: Array<string>;
  fileNames?: Array<string>;
};

/** The full file-icon map: icon basename -> its associated tokens. */
export type FileIcons = Record<string, FileIconEntry>;
