/**
 * Assembles the complete folder-icon map from its alphabetical data shards.
 *
 * Shards are spread in key order so the merged object preserves the original
 * insertion order, which `./tables.ts` relies on for its reverse lookup.
 */

import { folderIcons_a_g } from "./data/data-a-g";
import { folderIcons_g_t } from "./data/data-g-t";
import { folderIcons_t_y } from "./data/data-t-y";
import type { FolderIcons } from "./types";

/**
 * Default folder icon associations. Keys are icon file basenames (without the
 * `folder_` prefix); values list the folder names associated with each icon.
 */
export const folderIcons: FolderIcons = {
  ...folderIcons_a_g,
  ...folderIcons_g_t,
  ...folderIcons_t_y,
};
