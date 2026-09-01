import type { CodingAgentsUiCapability } from "@termco/agents-base";
import type { AiSessionsCapability } from "@termco/ai-sessions-base";
import type {
  SessionHistoryCapability,
  SessionQueryCapability,
} from "@termco/session-base";
import type { WorkspaceTabsCapability } from "@termco/workspace-base";

export interface TrajectoryRuntime {
  readonly history: SessionHistoryCapability;
  readonly tabs: WorkspaceTabsCapability;
  query: SessionQueryCapability | null;
  aiSessions: AiSessionsCapability | null;
  codingAgents: CodingAgentsUiCapability | null;
}

let active: TrajectoryRuntime | null = null;

export function configureTrajectoryRuntime(runtime: TrajectoryRuntime | null): void {
  active = runtime;
}

export function getTrajectoryRuntime(): TrajectoryRuntime {
  if (!active) throw new Error("trajectory-native is not active");
  return active;
}
