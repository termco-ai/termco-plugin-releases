export * from "./agentActivity";
export * from "./agentHooks";
export * from "./codingAgents";

export const AGENTS_TERMINAL_HOOKS_SERVICE = "agents.terminal-hooks" as const;
export const AGENTS_ACTIVITY_SERVICE = "agents.activity" as const;
export const AGENTS_ACTIVITY_CONTROL_SERVICE = "agents.activity-control" as const;
export const AGENTS_ACTIVITY_EVENTS_SERVICE = "agents.activity-events" as const;
export const AGENTS_CODING_SESSIONS_SERVICE = "agents.coding-sessions" as const;
export const AGENTS_CODING_UI_SERVICE = "agents.coding-ui" as const;

declare module "@termco/kernel" {
  interface Services {
    [AGENTS_TERMINAL_HOOKS_SERVICE]: import("./agentHooks").AgentHooksCapability;
    [AGENTS_ACTIVITY_SERVICE]: import("./agentActivity").AgentActivityCapability;
    [AGENTS_ACTIVITY_CONTROL_SERVICE]: import("./agentActivity").AgentActivityControlCapability;
    [AGENTS_ACTIVITY_EVENTS_SERVICE]: import("./agentActivity").AgentActivityEventRegistry;
    [AGENTS_CODING_SESSIONS_SERVICE]: import("./codingAgents").CodingAgentsCapability;
    [AGENTS_CODING_UI_SERVICE]: import("./codingAgents").CodingAgentsUiCapability;
  }
}
