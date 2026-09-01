import type { DesktopIntegrationCapability } from "@termco/desktop-base";
import type { ApplicationEventsCapability } from "@termco/events-base";
import type { SecretsCapability } from "@termco/storage-base";

let dependencies: {
  events: ApplicationEventsCapability;
  desktop: DesktopIntegrationCapability;
  secrets: SecretsCapability;
} | null = null;

export function mcpRuntimeActive(): boolean {
  return dependencies !== null;
}

export function configureMcpRuntime(
  value: NonNullable<typeof dependencies>,
): () => void {
  dependencies = value;
  return () => {
    if (dependencies === value) dependencies = null;
  };
}

function selected(): NonNullable<typeof dependencies> {
  if (!dependencies) throw new Error("mcp.clients dependencies are not configured");
  return dependencies;
}

export const applicationEvents = () => selected().events;
export const desktopIntegration = () => selected().desktop;
export const secretStorage = () => selected().secrets;
