import type {} from "@termco/kernel";

export const UI_AGENTS_VIEW_SERVICE = "ui.agents-view";

export interface UiAgentsViewSnapshot {
  revision: number;
  open: boolean;
  openSequence: number;
}

/** Selected application-wide Agents & Snippets manager visibility. The source
 * plugin owns this state; shell integrations only request or observe it. */
export interface UiAgentsViewCapability {
  snapshot(): UiAgentsViewSnapshot;
  subscribe(listener: () => void): () => void;
  show(): void;
  close(): void;
  toggle(): void;
}

declare module "@termco/kernel" {
  interface Services {
    [UI_AGENTS_VIEW_SERVICE]: UiAgentsViewCapability;
  }
}
