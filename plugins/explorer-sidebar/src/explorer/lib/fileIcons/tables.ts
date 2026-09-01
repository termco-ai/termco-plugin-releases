/**
 * Reverse-lookup tables derived from the file-icon map.
 *
 * Inverts `fileIcons` (icon -> tokens) into token -> icon maps for the three
 * lookup dimensions used by the icon resolver: language id, file extension, and
 * file name. Derivation is intentionally byte-identical to the original monolith:
 * a single `reduce` over `Object.entries(fileIcons)`, so that when two icons
 * claim the same token the later entry wins.
 */
import { fileIcons } from "./map";

const { fileExtensions, fileNames } = Object.entries(
  fileIcons,
).reduce(
  ({ languageIds, fileExtensions, fileNames }, [name, icon]) => ({
    languageIds: {
      ...languageIds,
      ...icon.languageIds?.reduce((a, c) => ({ ...a, [c]: name }), {}),
    },
    fileExtensions: {
      ...fileExtensions,
      ...icon.fileExtensions?.reduce((a, c) => ({ ...a, [c]: name }), {}),
    },
    fileNames: {
      ...fileNames,
      ...icon.fileNames?.reduce((a, c) => ({ ...a, [c]: name }), {}),
    },
  }),
  {
    languageIds: {},
    fileExtensions: {},
    fileNames: {},
  },
);

export { fileExtensions, fileNames };
