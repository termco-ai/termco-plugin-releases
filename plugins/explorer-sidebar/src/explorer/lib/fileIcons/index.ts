/**
 * Public barrel for the file-icon data set.
 *
 * Re-exports the exact four symbols the former `fileIcons.ts` monolith exposed
 * so importers (e.g. `../iconResolver`) resolve `./fileIcons` unchanged:
 * the icon map plus the three reverse-lookup tables.
 */
;
export { fileExtensions, fileNames,  } from "./tables";
