import type { ShortcutId } from "@termco/shortcuts-base";

export type PaletteItem = {
  id: string;
  title: string;
  group: string;
  keywords?: string[];
  icon?: unknown;
  description?: string;
  iconUrl?: string;
  shortcutId?: ShortcutId;
  trailing?: string;
  disabledReason?: string;
  order?: number;
  run: () => void;
  owner?: {
    pluginId: string;
    generation: string;
    key: string;
  };
};

export type PaletteMode = "commands" | "history" | "content" | "help";
