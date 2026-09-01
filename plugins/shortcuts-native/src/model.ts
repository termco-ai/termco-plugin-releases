import type {
  KeyBinding,
  ShortcutDefinition,
  ShortcutHandlerOptions,
  ShortcutHandlers,
  ShortcutId,
  ShortcutKeyEvent,
  ShortcutRegistryCapability,
  ShortcutRegistrySnapshot,
} from "@termco/shortcuts-base";
import type { PreferencesCapability } from "@termco/storage-base";

export type ShortcutHandlerSource = () => {
  handlers: ShortcutHandlers;
  options?: ShortcutHandlerOptions;
};

export type ShortcutRegistryModel = Omit<
  ShortcutRegistryCapability,
  "useHandlers"
> & {
  registerSource(source: ShortcutHandlerSource): () => void;
  dispatch(event: KeyboardEvent): void;
  bindPreferences(preferences: PreferencesCapability): Promise<() => void>;
};

export const SHORTCUTS_PREFERENCE_KEY = "shortcuts";

function isMac(): boolean {
  if (typeof navigator === "undefined") return false;
  return /mac|iphone|ipad|ipod/i.test(navigator.platform || navigator.userAgent);
}

function mod(key: string, extra: Omit<KeyBinding, "key"> = {}): KeyBinding {
  return { ...(isMac() ? { meta: true } : { ctrl: true }), ...extra, key };
}

export const DEFAULT_SHORTCUT_GROUPS = [
  "General", "Tabs", "Rigs", "Panes", "Terminal", "View", "Search", "AI", "Editor",
] as const;

export const DEFAULT_SHORTCUTS: ShortcutDefinition[] = [
  { id: "commandPalette.open", label: "Open command palette", group: "General", defaultBindings: [mod("p")] },
  { id: "commandPalette.content", label: "Find in files", group: "General", defaultBindings: [mod("p", { shift: true })] },
  { id: "settings.open", label: "Open settings", group: "General", defaultBindings: [mod(",")] },
  { id: "tab.new", label: "New tab", group: "Tabs", defaultBindings: [mod("t")] },
  { id: "tab.newBlock", label: "New Blocks terminal", group: "Tabs", defaultBindings: [mod("t", { shift: true })] },
  { id: "tab.newPrivate", label: "New private terminal", group: "Tabs", defaultBindings: [mod("r")] },
  { id: "tab.newPreview", label: "New web preview", group: "Tabs", defaultBindings: [mod("o", { shift: true })] },
  { id: "tab.newEditor", label: "New editor tab", group: "Tabs", defaultBindings: [mod("e")] },
  { id: "tab.close", label: "Close tab or pane", group: "Tabs", defaultBindings: [mod("w")] },
  { id: "tab.next", label: "Next tab", group: "Tabs", defaultBindings: [{ ctrl: true, key: "Tab" }], allowRepeat: true },
  { id: "tab.prev", label: "Previous tab", group: "Tabs", defaultBindings: [{ ctrl: true, shift: true, key: "Tab" }], allowRepeat: true },
  { id: "tab.selectByIndex", label: "Jump to tab 1–9", group: "Tabs", defaultBindings: [mod("1")], configurable: false },
  { id: "rig.next", label: "Next rig", group: "Rigs", defaultBindings: [mod("]", { shift: true })] },
  { id: "rig.prev", label: "Previous rig", group: "Rigs", defaultBindings: [mod("[", { shift: true })] },
  { id: "rig.overview", label: "Open rigs", group: "Rigs", defaultBindings: [mod("s", { shift: true })] },
  { id: "pane.splitRight", label: "Split pane right", group: "Panes", defaultBindings: [mod("d")] },
  { id: "pane.splitDown", label: "Split pane down", group: "Panes", defaultBindings: [mod("d", { shift: true })] },
  { id: "pane.focusNext", label: "Focus next pane", group: "Panes", defaultBindings: [mod("]")] },
  { id: "pane.focusPrev", label: "Focus previous pane", group: "Panes", defaultBindings: [mod("[")] },
  { id: "pane.source", label: "Toggle source panel", group: "Panes", defaultBindings: [mod("g")] },
  { id: "terminal.clear", label: "Clear terminal", group: "Terminal", defaultBindings: isMac() ? [{ meta: true, key: "k" }] : [] },
  { id: "terminal.toggleInput", label: "Toggle Shell / AI input", group: "Terminal", defaultBindings: [mod("u")] },
  { id: "blocks.prev", label: "Previous command block", group: "Terminal", defaultBindings: [mod("ArrowUp")], allowRepeat: true },
  { id: "blocks.next", label: "Next command block", group: "Terminal", defaultBindings: [mod("ArrowDown")], allowRepeat: true },
  { id: "sidebar.toggle", label: "Toggle file explorer", group: "View", defaultBindings: [mod("b"), mod("b", { shift: true })] },
  { id: "explorer.focus", label: "Toggle file explorer focus", group: "View", defaultBindings: [mod("e", { shift: true })] },
  { id: "view.zoomIn", label: "Zoom in", group: "View", defaultBindings: [mod("="), mod("+", { shift: true })], allowRepeat: true },
  { id: "view.zoomOut", label: "Zoom out", group: "View", defaultBindings: [mod("-"), mod("_", { shift: true })], allowRepeat: true },
  { id: "view.zoomReset", label: "Reset zoom", group: "View", defaultBindings: [mod("0")] },
  { id: "view.zenMode", label: "Toggle zen mode", group: "View", defaultBindings: [mod("z", { shift: true })] },
  { id: "explorer.search", label: "Search files", group: "Search", defaultBindings: [mod("f", { shift: true })] },
  { id: "search.focus", label: "Find in terminal", group: "Search", defaultBindings: [mod("f")] },
  { id: "ai.toggle", label: "Toggle AI agent", group: "AI", defaultBindings: [mod("i")] },
  { id: "ai.askSelection", label: "Ask AI about selection", group: "AI", defaultBindings: [mod("j")] },
  { id: "agent.focusAttention", label: "Jump to agent needing attention", group: "AI", defaultBindings: [mod("a", { shift: true })] },
  { id: "editor.undo", label: "Undo", group: "Editor", defaultBindings: [mod("z")], configurable: false },
  { id: "editor.redo", label: "Redo", group: "Editor", defaultBindings: [mod("y")], configurable: false },
];

export function matchBinding(event: ShortcutKeyEvent, binding: KeyBinding, id?: ShortcutId): boolean {
  if (id === "tab.selectByIndex") {
    if (!/^[1-9]$/.test(event.key)) return false;
  } else if (event.key.toLowerCase() !== binding.key.toLowerCase()) return false;
  return !!event.ctrlKey === !!binding.ctrl && !!event.shiftKey === !!binding.shift &&
    !!event.altKey === !!binding.alt && !!event.metaKey === !!binding.meta;
}

export function bindingTokens(binding?: KeyBinding): string[] {
  if (!binding) return [];
  const tokens: string[] = [];
  if (isMac()) {
    if (binding.ctrl) tokens.push("⌃");
    if (binding.alt) tokens.push("⌥");
    if (binding.shift) tokens.push("⇧");
    if (binding.meta) tokens.push("⌘");
  } else {
    if (binding.ctrl) tokens.push("Ctrl");
    if (binding.alt) tokens.push("Alt");
    if (binding.shift) tokens.push("Shift");
    if (binding.meta) tokens.push("Win");
  }
  const labels: Record<string, string> = { " ": "Space", ArrowUp: "↑", ArrowDown: "↓", ArrowLeft: "←", ArrowRight: "→" };
  const key = labels[binding.key] ?? (binding.key.length === 1 ? binding.key.toUpperCase() : binding.key);
  return [...tokens, key];
}

function normalizeOverrides(value: unknown): Record<string, KeyBinding[]> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const next: Record<string, KeyBinding[]> = {};
  for (const [id, bindings] of Object.entries(value)) {
    if (!Array.isArray(bindings)) continue;
    next[id] = bindings.filter((binding): binding is KeyBinding =>
      Boolean(binding && typeof binding === "object" && typeof (binding as KeyBinding).key === "string"));
  }
  return next;
}

export function createStableShortcutRegistry(
  shortcuts: ShortcutDefinition[] = DEFAULT_SHORTCUTS,
  groups: readonly string[] = DEFAULT_SHORTCUT_GROUPS,
): ShortcutRegistryModel {
  let preferences: PreferencesCapability | undefined;
  let dirtyWhileUnbound = false;
  let hasHydrated = false;
  let overrides: Record<string, KeyBinding[]> = {};
  let revision = 0;
  let snapshot: ShortcutRegistrySnapshot = { revision, groups: [...groups], shortcuts: [...shortcuts], overrides };
  const listeners = new Set<() => void>();
  const sources: ShortcutHandlerSource[] = [];
  const publish = () => {
    revision += 1;
    snapshot = { revision, groups: [...groups], shortcuts: [...shortcuts], overrides };
    for (const listener of listeners) listener();
  };
  const write = async (next: Record<string, KeyBinding[]>) => {
    const previous = overrides;
    overrides = next;
    publish();
    if (!preferences) {
      dirtyWhileUnbound = true;
      return;
    }
    try {
      await preferences.set(SHORTCUTS_PREFERENCE_KEY, next);
      dirtyWhileUnbound = false;
    } catch (error) {
      overrides = previous;
      publish();
      throw error;
    }
  };
  return {
    snapshot: () => snapshot,
    subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener); },
    bindings(id) {
      const custom = overrides[id];
      return custom ?? shortcuts.find((shortcut) => shortcut.id === id)?.defaultBindings ?? [];
    },
    match: matchBinding,
    format: bindingTokens,
    registerSource(source) {
      sources.push(source);
      return () => {
        const index = sources.indexOf(source);
        if (index >= 0) sources.splice(index, 1);
      };
    },
    dispatch(event) {
      if (
        (event.target as HTMLElement | null)?.closest?.(
          "[data-shortcut-recorder]",
        )
      ) {
        return;
      }
      for (const shortcut of snapshot.shortcuts) {
        if (event.repeat && !shortcut.allowRepeat) continue;
        const bindings =
          snapshot.overrides[shortcut.id] ?? shortcut.defaultBindings;
        if (
          !bindings.some((binding) =>
            matchBinding(event, binding, shortcut.id),
          )
        ) {
          continue;
        }
        for (const source of sources) {
          const { handlers, options } = source();
          const handler = handlers[shortcut.id];
          if (!handler) continue;
          if (options?.isDisabled?.(shortcut.id, event)) return;
          event.preventDefault();
          event.stopImmediatePropagation();
          handler(event);
          return;
        }
        return;
      }
    },
    async setBindings(id, bindings) {
      if (!shortcuts.some((shortcut) => shortcut.id === id)) throw new Error(`Unknown shortcut: ${id}`);
      await write({ ...overrides, [id]: bindings.map((binding) => ({ ...binding })) });
    },
    async reset(id) { const next = { ...overrides }; delete next[id]; await write(next); },
    async resetAll() { await write({}); },
    async bindPreferences(nextPreferences) {
      preferences = nextPreferences;
      if (dirtyWhileUnbound) {
        await nextPreferences.set(SHORTCUTS_PREFERENCE_KEY, overrides);
        dirtyWhileUnbound = false;
      } else if (!hasHydrated) {
        overrides = normalizeOverrides(
          await nextPreferences.get(SHORTCUTS_PREFERENCE_KEY),
        );
        hasHydrated = true;
        publish();
      }
      const unsubscribe = nextPreferences.subscribe((key, value) => {
        if (key !== SHORTCUTS_PREFERENCE_KEY) return;
        overrides = normalizeOverrides(value);
        publish();
      });
      let bound = true;
      return () => {
        if (!bound) return;
        bound = false;
        unsubscribe();
        if (preferences === nextPreferences) preferences = undefined;
      };
    },
  };
}

export async function createShortcutRegistry(
  preferences: PreferencesCapability,
  shortcuts: ShortcutDefinition[] = DEFAULT_SHORTCUTS,
  groups: readonly string[] = DEFAULT_SHORTCUT_GROUPS,
): Promise<ShortcutRegistryModel> {
  const registry = createStableShortcutRegistry(shortcuts, groups);
  await registry.bindPreferences(preferences);
  return registry;
}
