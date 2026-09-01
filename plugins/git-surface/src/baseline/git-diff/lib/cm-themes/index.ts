/**
 * Barrel for the editor's locally-defined CodeMirror color themes.
 *
 * Re-exports every theme extension from the per-family data shards; `themes.ts`
 * maps these onto the `EditorThemeId` union in `EDITOR_THEME_EXT`.
 */
export { catppuccinLatte, catppuccinMocha } from "./catppuccin";
export { dracula } from "./dracula";
export { everforestDark, everforestLight } from "./everforest";
export { kanagawa, kanagawaDragon, kanagawaLotus } from "./kanagawa";
export { rosePine, rosePineDawn } from "./rose-pine";
export { solarizedDark, solarizedLight } from "./solarized";
