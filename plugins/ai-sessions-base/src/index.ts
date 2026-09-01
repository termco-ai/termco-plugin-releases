export * from "./aiContextArtifacts";
export * from "./aiSessions";

export const AI_SESSIONS_SERVICE = "ai.sessions" as const;
export const AI_CONTEXT_ARTIFACTS_SERVICE = "ai.context-artifacts" as const;

declare module "@termco/kernel" {
  interface Services {
    [AI_SESSIONS_SERVICE]: import("./aiSessions").AiSessionsCapability;
    [AI_CONTEXT_ARTIFACTS_SERVICE]: import("./aiContextArtifacts").AiContextArtifactsCapability;
  }
}
