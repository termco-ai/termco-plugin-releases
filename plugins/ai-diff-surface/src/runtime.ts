import type { UiThemeCapability } from "@termco/ui-theme-base";

let theme: UiThemeCapability | null = null;

export function installAiDiffRuntime(capability: UiThemeCapability): () => void {
  theme = capability;
  return () => {
    if (theme === capability) theme = null;
  };
}

export function aiDiffRuntime(): { theme: UiThemeCapability } {
  if (!theme) throw new Error("AI diff surface runtime is not active");
  return { theme };
}
