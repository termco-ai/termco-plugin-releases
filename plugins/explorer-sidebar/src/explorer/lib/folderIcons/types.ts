/**
 * Shared value type for the folder-icon data shards.
 */

/** One folder-icon association: the folder names that resolve to an icon basename. */
export type FolderIconEntry = {
  folderNames?: Array<string>;
};

/** The full folder-icon map: icon basename -> its associated folder names. */
export type FolderIcons = Record<string, FolderIconEntry>;
