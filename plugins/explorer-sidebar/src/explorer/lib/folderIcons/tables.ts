/**
 * Reverse-lookup table derived from the folder-icon map.
 *
 * Inverts `folderIcons` (icon -> folder names) into a folder-name -> icon map,
 * prefixing each icon basename with `folder_`. Derivation is byte-identical to
 * the original monolith: a single `reduce` over `Object.entries(folderIcons)`,
 * so a later entry wins when two icons claim the same folder name.
 */
import { folderIcons } from "./map";

const { folderNames } = Object.entries(folderIcons).reduce(
  ({ folderNames }, [name, icon]) => ({
    folderNames: {
      ...folderNames,
      ...icon.folderNames?.reduce(
        (a, c) => ({ ...a, [c]: `folder_${name}` }),
        {},
      ),
    },
  }),
  {
    folderNames: {},
  },
);

export { folderNames };
