export * from "./editorLanguages";
export * from "./editorLspStatus";
export * from "./editorNavigation";
export * from "./editorSessions";
export * from "./lsp";
export * from "./markdownNavigation";

export const EDITOR_SESSIONS_SERVICE = "editor.sessions" as const;
export const EDITOR_NAVIGATION_SERVICE = "editor.navigation" as const;
export const EDITOR_LANGUAGES_SERVICE = "editor.languages" as const;
export const EDITOR_LSP_STATUS_SERVICE = "editor.lsp-status" as const;
export const MARKDOWN_NAVIGATION_SERVICE = "markdown.navigation" as const;
export const LSP_SESSIONS_SERVICE = "lsp.sessions" as const;

declare module "@termco/kernel" {
  interface Services {
    [EDITOR_SESSIONS_SERVICE]: import("./editorSessions").EditorSessionsCapability;
    [EDITOR_NAVIGATION_SERVICE]: import("./editorNavigation").EditorNavigationCapability;
    [EDITOR_LANGUAGES_SERVICE]: import("./editorLanguages").EditorLanguagesCapability;
    [EDITOR_LSP_STATUS_SERVICE]: import("./editorLspStatus").EditorLspStatusCapability;
    [MARKDOWN_NAVIGATION_SERVICE]: import("./markdownNavigation").MarkdownNavigationCapability;
    [LSP_SESSIONS_SERVICE]: import("./lsp").LspSessionsCapability;
  }
}
