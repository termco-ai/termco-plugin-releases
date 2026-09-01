export * from "./coreEvents";
export * from "./errors";
export * from "./events";
export * from "./header";
export * from "./identity";
export * from "./invariants";
export * from "./json";
export * from "./persistence";
export * from "./projections";
export * from "./query";
export * from "./requestFold";
export * from "./repair";
export * from "./surface";
export * from "./version";
export * from "./validation";

export const SESSION_HISTORY_SERVICE = "session.history" as const;
export const SESSION_QUERY_SERVICE = "session.query" as const;
export const SESSION_MODEL_QUERY_SERVICE = "session.query.model" as const;

declare module "@termco/kernel" {
  interface Services {
    [SESSION_HISTORY_SERVICE]: import("./persistence").SessionHistoryCapability;
    [SESSION_QUERY_SERVICE]: import("./query").SessionQueryCapability;
    [SESSION_MODEL_QUERY_SERVICE]: import("./query").SessionModelQueryCapability;
  }
}
