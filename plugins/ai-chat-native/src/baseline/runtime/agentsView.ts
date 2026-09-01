import type { UiAgentsViewCapability } from "@termco/ui-agents-base";

let agentsView: UiAgentsViewCapability | null = null;

export function aiAgentsViewActive(): boolean {
  return agentsView !== null;
}

export function configureAgentsView(
  capability: UiAgentsViewCapability,
): () => void {
  agentsView = capability;
  return () => {
    if (agentsView === capability) agentsView = null;
  };
}

export function openAgentsView(): void {
  agentsView?.show();
}
