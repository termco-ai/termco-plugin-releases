/**
 * Assembles the complete file-icon map from its alphabetical data shards.
 *
 * The shards are spread in key order so the merged object preserves the original
 * insertion order — this matters because `./tables.ts` derives reverse lookups
 * where a later icon wins when two icons claim the same extension/name/language.
 */

import { fileIcons_3_d } from "./data/data-3-d";
import { fileIcons_d_h } from "./data/data-d-h";
import { fileIcons_h_m } from "./data/data-h-m";
import { fileIcons_m_r } from "./data/data-m-r";
import { fileIcons_r_v } from "./data/data-r-v";
import { fileIcons_v_z } from "./data/data-v-z";
import type { FileIcons } from "./types";

/**
 * Default file icon associations. Keys are icon file basenames; values list the
 * language ids, file extensions, and file names associated with each icon.
 */
export const fileIcons: FileIcons = {
  ...fileIcons_3_d,
  ...fileIcons_d_h,
  ...fileIcons_h_m,
  ...fileIcons_m_r,
  ...fileIcons_r_v,
  ...fileIcons_v_z,
};
