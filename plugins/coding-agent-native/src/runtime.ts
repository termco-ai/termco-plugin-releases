import type { ApplicationEventsCapability } from "@termco/events-base";
import type { McpServerCapability } from "@termco/mcp-base";
import type { SessionHistoryCapability } from "@termco/session-base";
import type { WorkspaceExecutionCapability } from "@termco/workspace-base";

export interface CodingAgentRuntime {
  events: ApplicationEventsCapability;
  mcpServer: McpServerCapability;
  execution: WorkspaceExecutionCapability;
  history: SessionHistoryCapability;
}

let active: CodingAgentRuntime | null = null;

export function codingAgentRuntimeActive(): boolean {
  return active !== null;
}

export function configureCodingAgentRuntime(runtime: CodingAgentRuntime | null): void {
  active = runtime;
}

export function codingAgentRuntime(): CodingAgentRuntime {
  if (!active) throw new Error("coding-agent-native runtime is not active");
  return active;
}
