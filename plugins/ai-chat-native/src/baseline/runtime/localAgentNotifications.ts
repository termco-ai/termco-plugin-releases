import type {
  AgentActivityControlCapability,
  AgentActivityLocalNotification,
  AgentActivityLocalState,
} from "@termco/agents-base";

export type AgentStatus = "working" | "waiting";

let activity: AgentActivityControlCapability | null = null;

export function aiLocalAgentNotificationsActive(): boolean {
  return activity !== null;
}

export function configureLocalAgentNotifications(
  capability: AgentActivityControlCapability,
): () => void {
  activity = capability;
  return () => {
    if (activity === capability) {
      capability.setLocalAgent(null);
      activity = null;
    }
  };
}

export function setLocalAgent(state: AgentActivityLocalState | null): void {
  activity?.setLocalAgent(state);
}

export function routeAgentNotification(
  input: AgentActivityLocalNotification,
): void {
  activity?.notifyLocal(input);
}
