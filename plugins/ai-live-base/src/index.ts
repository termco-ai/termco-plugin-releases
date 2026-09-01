export * from "./aiLive";

export const AI_LIVE_SERVICE = "ai.live" as const;
export const AI_LIVE_CONTRIBUTIONS_SERVICE = "ai.live-contributions" as const;

declare module "@termco/kernel" {
  interface Services {
    [AI_LIVE_SERVICE]: import("./aiLive").AiLiveCapability;
    [AI_LIVE_CONTRIBUTIONS_SERVICE]: import("./aiLive").AiLiveContributionRegistry;
  }
}
