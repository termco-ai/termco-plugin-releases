export * from "./aiLibrary";

export const AI_LIBRARY_SERVICE = "ai.library" as const;
export const AI_LIBRARY_SOURCES_SERVICE = "ai.library.sources" as const;

declare module "@termco/kernel" {
  interface Services {
    [AI_LIBRARY_SERVICE]: import("./aiLibrary").AiLibraryCapability;
    [AI_LIBRARY_SOURCES_SERVICE]: import("./aiLibrary").AiLibrarySourceRegistry;
  }
}
