export * from "./aiTools";

export const AI_TOOLS_SERVICE = "ai.tools" as const;
export const AI_TOOLSETS_SERVICE = "ai.toolsets" as const;
export const AI_TOOL_EXECUTION_SERVICE = "ai.tool-execution" as const;
export const AI_BROWSER_POLICY_SERVICE = "ai.browser-policy" as const;

declare module "@termco/kernel" {
  interface Services {
    [AI_TOOLS_SERVICE]: import("./aiTools").AiToolRegistry;
    [AI_TOOLSETS_SERVICE]: import("./aiTools").AiToolsetRegistry;
    [AI_TOOL_EXECUTION_SERVICE]: import("./aiTools").AiToolExecutionCapability;
    [AI_BROWSER_POLICY_SERVICE]: import("./aiTools").AiBrowserPolicyCapability;
  }
}
