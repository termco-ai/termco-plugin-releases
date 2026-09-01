export * from "./fileIcons";
export * from "./files";

export const WORKSPACE_FILES_SERVICE = "workspace.files" as const;
export const UI_FILE_ICONS_SERVICE = "ui.file-icons" as const;
/** @deprecated Use UI_FILE_ICONS_SERVICE. */
export { UI_FILE_ICONS_SERVICE as WORKSPACE_FILE_ICONS_SERVICE };

declare module "@termco/kernel" {
  interface Services {
    [WORKSPACE_FILES_SERVICE]: import("./files").WorkspaceFilesCapability;
    [UI_FILE_ICONS_SERVICE]: import("./fileIcons").UiFileIconsCapability;
  }
}
