import type { ContributionOwner, ContributionRecord, Dispose } from "@termco/kernel";
import type { ComponentType } from "react";

export const UI_OVERLAYS_SERVICE = "ui.overlays";
export const UI_COMMAND_PALETTE_SERVICE = "ui.command-palette";

export interface UiOverlayContribution {
  id: string;
  label: string;
  description: string;
  order?: number;
  /** The contribution resolves its own declared capabilities. */
  Component: ComponentType;
}

export interface UiOverlayRegistry {
  register(
    entry: UiOverlayContribution,
    owner: ContributionOwner,
  ): Dispose;
  snapshot(): readonly UiOverlayContribution[];
  records(): readonly ContributionRecord<UiOverlayContribution>[];
  subscribe(listener: () => void): Dispose;
}

// biome-ignore format: Preserve the frozen public contract token signature.
export type UiCommandPaletteMode = "commands" | "history" | "content" | "themes" | "help";

export interface UiCommandPaletteSnapshot {
  revision: number;
  open: boolean;
  mode: UiCommandPaletteMode;
  query: string;
  anchor: HTMLElement | null;
  inputSlot: HTMLElement | null;
}

/** Selected application-wide command-palette state. The implementation and
 * UI live in a replaceable plugin; shell/header adapters only call this seam. */
export interface UiCommandPaletteCapability {
  snapshot(): UiCommandPaletteSnapshot;
  subscribe(listener: () => void): () => void;
  show(mode?: UiCommandPaletteMode): void;
  close(): void;
  setOpen(open: boolean): void;
  setQuery(query: string): void;
  setAnchor(element: HTMLElement | null): void;
  setInputSlot(element: HTMLElement | null): void;
}

declare module "@termco/kernel" {
  interface Services {
    [UI_OVERLAYS_SERVICE]: UiOverlayRegistry;
    [UI_COMMAND_PALETTE_SERVICE]: UiCommandPaletteCapability;
  }
}
