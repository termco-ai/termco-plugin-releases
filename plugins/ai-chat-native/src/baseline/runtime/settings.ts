import type { UiSettingsViewCapability } from "@termco/ui-settings-base";

let settings: UiSettingsViewCapability | null = null;

export function aiSettingsNavigationActive(): boolean {
  return settings !== null;
}

export function configureSettingsNavigation(
  capability: UiSettingsViewCapability,
): () => void {
  settings = capability;
  return () => {
    if (settings === capability) settings = null;
  };
}

export async function openSettingsWindow(section?: string): Promise<void> {
  settings?.show(section);
}
