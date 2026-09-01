import type {
  ContributionOwner,
  ContributionRecord,
  Dispose,
} from "@termco/kernel";
import type {
  UiContributionCapability,
  UiContributionRef,
} from "@termco/ui-shell-base";

export const UI_CHANGE_REVEAL_SERVICE = "ui.change-reveal";
export const UI_CHANGE_REVEAL_ADAPTERS_SERVICE = "ui.change-reveal.adapters";

export type UiChangeRevealMode = "spotlight" | "show" | "show-and-spotlight";

export interface UiChangeRevealRequest {
  target: UiContributionRef;
  mode: UiChangeRevealMode;
  announcement: string;
}

export interface UiChangeRevealResult {
  status: "revealed" | "not-found" | "unsupported";
  target: UiContributionRef;
  message: string;
}

/** Renderer-local adapter result. The router owns the visual cue and strips
 * the element before returning the serializable public result. */
export interface UiChangeRevealAdapterResult extends UiChangeRevealResult {
  element?: HTMLElement;
}

export interface UiChangeRevealAdapter {
  id: string;
  services: readonly UiContributionCapability[];
  reveal(request: UiChangeRevealRequest): Promise<UiChangeRevealAdapterResult>;
}

export interface UiChangeRevealAdapterDirectory {
  register(
    adapter: UiChangeRevealAdapter,
    owner: ContributionOwner,
  ): Dispose;
  records(): readonly ContributionRecord<UiChangeRevealAdapter>[];
  subscribe(listener: () => void): Dispose;
}

export interface UiChangeRevealCapability {
  reveal(request: UiChangeRevealRequest): Promise<UiChangeRevealResult>;
}

declare module "@termco/kernel" {
  interface Services {
    [UI_CHANGE_REVEAL_SERVICE]: UiChangeRevealCapability;
    [UI_CHANGE_REVEAL_ADAPTERS_SERVICE]: UiChangeRevealAdapterDirectory;
  }
}
