import type { ContributionOwner, ContributionRecord, Dispose } from "@termco/kernel";
import type { ComponentType } from "react";

export const UI_SETTINGS_VIEW_SERVICE = "ui.settings-view";
export const UI_SETTINGS_SECTIONS_SERVICE = "ui.settings.sections";

export interface UiSettingsSearchEntry {
  title: string;
  description: string;
  keywords?: string;
}

/** Complete, independently renderable settings feature contributed by a
 * source-owning plugin. */
export interface UiSettingsSectionContribution {
  id: string;
  label: string;
  description: string;
  category: string;
  order?: number;
  /** Plugin-owned Hugeicons-compatible data rendered in the settings rail. */
  icon?: unknown;
  Component: ComponentType<{ dismiss?: () => void }>;
  searchEntries: UiSettingsSearchEntry[];
}

export interface UiSettingsSectionRegistry {
  register(
    entry: UiSettingsSectionContribution,
    owner: ContributionOwner,
  ): Dispose;
  snapshot(): readonly UiSettingsSectionContribution[];
  records(): readonly ContributionRecord<UiSettingsSectionContribution>[];
  subscribe(listener: () => void): Dispose;
}

export interface UiSettingsViewSnapshot {
  revision: number;
  open: boolean;
  requestedSection: string | null;
  openSequence: number;
}

/** Selected application-wide settings navigation state. The source plugin
 * owns this state so header, shortcuts, status items, and settings UI share it. */
export interface UiSettingsViewCapability {
  snapshot(): UiSettingsViewSnapshot;
  subscribe(listener: () => void): () => void;
  show(sectionId?: string): void;
  close(): void;
  toggle(sectionId?: string): void;
}

declare module "@termco/kernel" {
  interface Services {
    [UI_SETTINGS_VIEW_SERVICE]: UiSettingsViewCapability;
    [UI_SETTINGS_SECTIONS_SERVICE]: UiSettingsSectionRegistry;
  }
}
