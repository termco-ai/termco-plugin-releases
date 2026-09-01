import {
  CODING_AGENT_EVENTS,
  type CodingAgentRunEvent,
  type CodingAgentsCapability,
} from "@termco/agents-base";
import type { ApplicationEventsCapability } from "@termco/events-base";
import type { McpServerCapability } from "@termco/mcp-base";
import type { SessionQueryCapability } from "@termco/session-base";
import type { TrajectoryNavigationCapability } from "@termco/trajectory-base";
import { routeAgentEvent } from "./lib/client";

export interface CodingAgentUiRuntime {
  agents: CodingAgentsCapability;
  events: ApplicationEventsCapability;
  mcp: McpServerCapability;
  query: SessionQueryCapability | null;
  trajectory: TrajectoryNavigationCapability | null;
}

let active: CodingAgentUiRuntime | null = null;
let unsubscribeRunEvents: (() => void) | null = null;

export function codingAgentUiRuntimeActive(): boolean {
  return active !== null;
}

export function configureCodingAgentUiRuntime(
  runtime: CodingAgentUiRuntime | null,
): void {
  unsubscribeRunEvents?.();
  unsubscribeRunEvents = null;
  active = runtime;
  if (runtime) {
    unsubscribeRunEvents = runtime.events.subscribe(
      CODING_AGENT_EVENTS.runEvent,
      (payload) => routeAgentEvent(payload as CodingAgentRunEvent),
    );
  }
}

export function codingAgentUiRuntime(): CodingAgentUiRuntime {
  if (!active) throw new Error("coding-agent-native renderer is not active");
  return active;
}
