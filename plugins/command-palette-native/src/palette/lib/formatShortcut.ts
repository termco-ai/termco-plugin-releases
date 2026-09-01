// Resolves a command's shortcut id to a human-readable key label, honoring the
// user's overrides and falling back to the shortcut's default bindings.

import type {
  ShortcutId,
  ShortcutRegistryCapability,
} from "@termco/shortcuts-base";

/**
 * Format the primary key binding for `shortcutId` as a display string.
 *
 * @param shortcutId Shortcut to look up, or `undefined` for commands with none.
 * @param userShortcuts The user's per-shortcut binding overrides.
 * @returns Space-joined key tokens (e.g. `"⌘ K"`), or `null` when unbound.
 */
export function formatShortcut(
  shortcutId: ShortcutId | undefined,
  shortcuts: ShortcutRegistryCapability,
): string | null {
  if (!shortcutId) return null;
  const tokens = shortcuts.format(shortcuts.bindings(shortcutId)[0]);
  return tokens.length ? tokens.join(" ") : null;
}
