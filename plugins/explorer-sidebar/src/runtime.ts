import type { DesktopIntegrationCapability } from "@termco/desktop-base";
import type { ApplicationEventsCapability } from "@termco/events-base";
import type { WorkspaceFilesCapability } from "@termco/files-base";
import type { GitCapability } from "@termco/git-base";
import type { ShortcutRegistryCapability } from "@termco/shortcuts-base";
import type { PreferencesCapability } from "@termco/storage-base";
import ui from "@termco/ui";

export type ExplorerPreferences = {
  showHidden: boolean;
  explorerGitDecorations: boolean;
};

export type ExplorerRuntime = {
  files: WorkspaceFilesCapability;
  preferences: PreferencesCapability;
  desktop: DesktopIntegrationCapability;
  events: ApplicationEventsCapability;
  git: GitCapability | null;
  shortcuts: ShortcutRegistryCapability;
};

const defaults: ExplorerPreferences = {
  showHidden: false,
  explorerGitDecorations: true,
};

let activeRuntime: ExplorerRuntime | null = null;
let preferenceSnapshot: ExplorerPreferences = defaults;
const preferenceListeners = new Set<() => void>();
const gitAvailabilityListeners = new Set<() => void>();
let gitAvailabilityRevision = 0;

export function notifyExplorerGitChanged(): void {
  gitAvailabilityRevision += 1;
  for (const listener of gitAvailabilityListeners) listener();
}

export function subscribeExplorerGit(listener: () => void): () => void {
  gitAvailabilityListeners.add(listener);
  return () => gitAvailabilityListeners.delete(listener);
}

export function explorerGitSnapshot(): number {
  return gitAvailabilityRevision;
}

export function installExplorerRuntime(runtime: ExplorerRuntime): void {
  activeRuntime = runtime;
}

function publishPreferences(next: ExplorerPreferences): void {
  if (
    next.showHidden === preferenceSnapshot.showHidden &&
    next.explorerGitDecorations === preferenceSnapshot.explorerGitDecorations
  ) {
    return;
  }
  preferenceSnapshot = next;
  for (const listener of preferenceListeners) listener();
}

function applyPreference(key: string, value: unknown): void {
  if (key === "showHidden" && typeof value === "boolean") {
    publishPreferences({ ...preferenceSnapshot, showHidden: value });
  }
  if (key === "explorerGitDecorations" && typeof value === "boolean") {
    publishPreferences({ ...preferenceSnapshot, explorerGitDecorations: value });
  }
}

export async function startExplorerRuntime(
  runtime: ExplorerRuntime,
): Promise<() => void> {
  installExplorerRuntime(runtime);
  const stored = await runtime.preferences.getMany([
    "showHidden",
    "showHiddenDirs",
    "explorerGitDecorations",
  ]);
  const legacyShowHidden =
    typeof stored.showHiddenDirs === "boolean"
      ? stored.showHiddenDirs
      : defaults.showHidden;
  const showHidden =
    typeof stored.showHidden === "boolean"
      ? stored.showHidden
      : legacyShowHidden;
  if (
    typeof stored.showHidden !== "boolean" &&
    typeof stored.showHiddenDirs === "boolean"
  ) {
    await runtime.preferences.set("showHidden", showHidden);
  }
  publishPreferences({
    showHidden,
    explorerGitDecorations:
      typeof stored.explorerGitDecorations === "boolean"
        ? stored.explorerGitDecorations
        : defaults.explorerGitDecorations,
  });
  const unsubscribe = runtime.events.subscribe(
    "termco://prefs-changed",
    (payload) => {
      if (!payload || typeof payload !== "object") return;
      const { key, value } = payload as { key?: unknown; value?: unknown };
      if (typeof key === "string") applyPreference(key, value);
    },
  );
  return () => {
    unsubscribe();
    if (activeRuntime === runtime) activeRuntime = null;
  };
}

export function explorerRuntime(): ExplorerRuntime {
  if (!activeRuntime) throw new Error("explorer plugin is not active");
  return activeRuntime;
}

export function useExplorerPreferences<T>(
  select: (state: ExplorerPreferences) => T,
): T {
  const snapshot = ui.React.useSyncExternalStore(
    (listener) => {
      preferenceListeners.add(listener);
      return () => preferenceListeners.delete(listener);
    },
    () => preferenceSnapshot,
  );
  return select(snapshot);
}

type ShortcutHandlers = Record<string, ((event: KeyboardEvent) => void) | undefined>;

export function useExplorerShortcuts(handlers: ShortcutHandlers): void {
  const latest = ui.React.useRef(handlers);
  latest.current = handlers;
  ui.React.useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const runtime = explorerRuntime();
      const definitions = new Map(
        runtime.shortcuts
          .snapshot()
          .shortcuts.map((shortcut) => [shortcut.id, shortcut]),
      );
      for (const [id, handler] of Object.entries(latest.current)) {
        if (!handler) continue;
        const definition = definitions.get(id);
        if (event.repeat && !definition?.allowRepeat) continue;
        if (
          !runtime.shortcuts
            .bindings(id)
            .some((binding) => runtime.shortcuts.match(event, binding, id))
        ) {
          continue;
        }
        event.preventDefault();
        event.stopImmediatePropagation();
        handler(event);
        return;
      }
    };
    window.addEventListener("keydown", onKey, { capture: true });
    return () => window.removeEventListener("keydown", onKey, { capture: true });
  }, []);
}
