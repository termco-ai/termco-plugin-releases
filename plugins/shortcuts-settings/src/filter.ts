import type { ShortcutDefinition } from "@termco/shortcuts-base";

export function filterShortcuts(shortcuts: readonly ShortcutDefinition[], query: string): ShortcutDefinition[] {
  const visible = shortcuts.filter((shortcut) => shortcut.id !== "tab.selectByIndex");
  const normalized = query.trim().toLowerCase();
  if (!normalized) return visible;
  return visible.filter((shortcut) =>
    `${shortcut.label} ${shortcut.description ?? ""} ${shortcut.group} ${shortcut.id}`.toLowerCase().includes(normalized));
}
