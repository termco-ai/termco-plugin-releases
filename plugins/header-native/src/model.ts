import type { ShortcutRegistryCapability } from "@termco/shortcuts-base";
import type {
  UiHeaderAgentNotification,
  UiHeaderAgentSession,
  UiHeaderTab,
} from "@termco/ui-header-base";

export function activityBadge(
  sessions: readonly UiHeaderAgentSession[],
  notifications: readonly UiHeaderAgentNotification[],
): number {
  const waiting = sessions.filter((session) => session.status === "waiting").length;
  const completed = notifications.filter(
    (notification) => !notification.read && notification.kind !== "attention",
  ).length;
  return waiting + completed;
}

export function shortcutLabel(
  shortcuts: ShortcutRegistryCapability,
  id: string,
  _platform: "macos" | "windows" | "linux" | "unknown",
): string {
  return shortcuts
    .format(shortcuts.bindings(id)[0])
    .join(" ");
}

export function tabGlyph(tab: UiHeaderTab): string {
  if (tab.private) return "◌";
  switch (tab.kind) {
    case "terminal": return ">_";
    case "editor": return "{}";
    case "preview": return "◎";
    case "markdown": return "M";
    case "git-history": return "⑂";
    case "git-diff":
    case "git-commit-file": return "±";
    case "container": return "⬡";
    case "ai-diff": return "AI";
    case "trajectory": return "↝";
    default: return "•";
  }
}

export function matchingTabs(tabs: readonly UiHeaderTab[], query: string): UiHeaderTab[] {
  const term = query.trim().toLocaleLowerCase();
  return term
    ? tabs.filter((tab) => `${tab.label} ${tab.title} ${tab.kind}`.toLocaleLowerCase().includes(term))
    : [...tabs];
}
