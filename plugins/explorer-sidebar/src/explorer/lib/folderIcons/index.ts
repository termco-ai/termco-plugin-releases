/**
 * Public barrel for the folder-icon data set.
 *
 * Re-exports the exact two symbols the former `folderIcons.ts` monolith exposed
 * so importers (e.g. `../iconResolver`) resolve `./folderIcons` unchanged.
 */
;
export { folderNames } from "./tables";
