import { useSyncExternalStore } from "react";
import { terminalRuntime } from "./runtime";

export function useShortcutLabel(id: string): string {
  const shortcuts = terminalRuntime().shortcuts;
  useSyncExternalStore(shortcuts.subscribe, shortcuts.snapshot, shortcuts.snapshot);
  return shortcuts.format(shortcuts.bindings(id)[0]).join(" ");
}
