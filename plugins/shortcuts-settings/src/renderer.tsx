import type { PluginModule } from "@termco/kernel";
import {
  SHORTCUTS_REGISTRY_SERVICE,
  type KeyBinding,
  type ShortcutDefinition,
  type ShortcutId,
  type ShortcutRegistryCapability,
} from "@termco/shortcuts-base";
import {
  UI_SETTINGS_SECTIONS_SERVICE,
  type UiSettingsSectionContribution,
  type UiSettingsSectionRegistry,
} from "@termco/ui-settings-base";
import ui from "@termco/ui";
import {
  ArrowTurnBackwardIcon,
  Delete02Icon,
  KeyboardIcon,
  Search01Icon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import type { ReactNode } from "react";
import { filterShortcuts } from "./filter";

const { useEffect, useMemo, useState, useSyncExternalStore } = ui.React;

function SettingsSection({ label, children }: { label: string; children: ReactNode }) {
  return (
    <section>
      <div className="termco-section-label mb-2">{label}</div>
      <div className="overflow-hidden rounded-lg border border-border bg-card shadow-[var(--shadow-control)]">
        {children}
      </div>
    </section>
  );
}

function Recorder({
  onRecord,
  onCancel,
}: {
  onRecord(binding: KeyBinding): void;
  onCancel(): void;
}) {
  useEffect(() => {
    const onDown = (event: KeyboardEvent) => {
      event.preventDefault();
      event.stopPropagation();
      if (event.key === "Escape") {
        onCancel();
        return;
      }
      if (["Control", "Shift", "Alt", "Meta"].includes(event.key)) return;
      const hasPrimary = event.ctrlKey || event.altKey || event.metaKey;
      if (!hasPrimary && (!event.shiftKey || event.key.length === 1)) return;
      onRecord({
        key: event.key,
        ctrl: event.ctrlKey,
        shift: event.shiftKey,
        alt: event.altKey,
        meta: event.metaKey,
      });
    };
    window.addEventListener("keydown", onDown, { capture: true });
    return () => window.removeEventListener("keydown", onDown, { capture: true });
  }, [onRecord, onCancel]);

  return (
    <div data-shortcut-recorder className="flex items-center gap-2 rounded bg-accent/50 px-2 py-1 text-xs ring-1 ring-accent">
      <span className="animate-pulse font-medium">Recording...</span>
      <span className="text-muted-foreground">(Esc to cancel)</span>
    </div>
  );
}

function ShortcutRow({
  shortcut,
  bindings,
  modified,
  recording,
  format,
  onStartRecording,
  onStopRecording,
  onRecord,
  onClear,
  onReset,
}: {
  shortcut: ShortcutDefinition;
  bindings: readonly KeyBinding[];
  modified: boolean;
  recording: boolean;
  format(binding: KeyBinding): string[];
  onStartRecording(): void;
  onStopRecording(): void;
  onRecord(binding: KeyBinding): void;
  onClear(): void;
  onReset(): void;
}) {
  return (
    <div className="group flex items-center justify-between gap-3.5 border-t border-border/60 px-[15px] py-[11px] transition-colors first:border-t-0">
      <div className="flex flex-col gap-0.5">
        <span className="text-sm">{shortcut.label}</span>
        {shortcut.description ? (
          <span className="truncate text-xs text-muted-foreground">{shortcut.description}</span>
        ) : null}
      </div>
      <div className="flex items-center gap-2">
        {recording ? (
          <Recorder onRecord={onRecord} onCancel={onStopRecording} />
        ) : (
          <>
            <div
              data-shortcut-trigger={shortcut.id}
              onClick={onStartRecording}
              className="flex min-w-[100px] cursor-pointer items-center justify-end gap-1"
            >
              {bindings.length > 0 ? (
                <ui.KbdGroup className="gap-1">
                  {format(bindings[0]).map((token, index) => (
                    <ui.Kbd
                      key={`${token}-${index}`}
                      className="h-auto rounded-md border border-border/60 bg-accent px-2 py-0.5 font-mono text-xs font-normal text-muted-foreground transition-colors group-hover:text-foreground"
                    >
                      {token}
                    </ui.Kbd>
                  ))}
                </ui.KbdGroup>
              ) : (
                <span className="text-xs text-muted-foreground italic">Unassigned</span>
              )}
            </div>
            <div className="flex items-center gap-1">
              {modified ? (
                <ui.Button
                  title="Reset to default"
                  variant="ghost"
                  size="icon"
                  className="size-7 text-muted-foreground hover:text-foreground"
                  onClick={onReset}
                >
                  <HugeiconsIcon icon={ArrowTurnBackwardIcon} size={12} />
                </ui.Button>
              ) : null}
              <ui.Button
                title="Clear shortcut"
                variant="ghost"
                size="icon"
                className="size-7 text-muted-foreground opacity-0 transition-opacity hover:text-destructive group-hover:opacity-100"
                onClick={onClear}
              >
                <HugeiconsIcon icon={Delete02Icon} size={12} />
              </ui.Button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

export function createShortcutSettings(registry: ShortcutRegistryCapability) {
  return function ShortcutSettings() {
    const snapshot = useSyncExternalStore(
      registry.subscribe,
      registry.snapshot,
      registry.snapshot,
    );
    const [search, setSearch] = useState("");
    const [recordingId, setRecordingId] = useState<ShortcutId | null>(null);
    const [resetDialogOpen, setResetDialogOpen] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const filtered = useMemo(
      () => filterShortcuts(snapshot.shortcuts, search),
      [snapshot.shortcuts, search],
    );

    const run = async (operation: () => Promise<void>) => {
      setError(null);
      try {
        await operation();
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : String(cause));
      }
    };

    return (
      <div data-testid="shortcuts-settings-section" className="flex flex-col gap-[22px]">
        <div className="flex items-center justify-between gap-3">
          <div className="relative flex max-w-[280px] flex-1 items-center">
            <HugeiconsIcon
              icon={Search01Icon}
              size={14}
              strokeWidth={1.8}
              className="absolute left-2.5 text-muted-foreground"
            />
            <ui.Input
              aria-label="Filter shortcuts"
              placeholder="Filter shortcuts…"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              className="h-8 rounded-md pl-8 text-xs"
            />
          </div>
          <ui.Button
            variant="outline"
            size="sm"
            className="h-7 gap-1.5 rounded-md px-2.5 text-xs"
            onClick={() => setResetDialogOpen(true)}
          >
            <HugeiconsIcon icon={ArrowTurnBackwardIcon} size={12} strokeWidth={2} />
            Restore defaults
          </ui.Button>
        </div>

        <div className="flex flex-col gap-[22px]">
          {snapshot.groups.map((group) => {
            const items = filtered.filter((shortcut) => shortcut.group === group);
            if (items.length === 0) return null;
            return (
              <SettingsSection key={group} label={group}>
                {items.map((shortcut) => (
                  <ShortcutRow
                    key={shortcut.id}
                    shortcut={shortcut}
                    bindings={snapshot.overrides[shortcut.id] ?? shortcut.defaultBindings}
                    modified={snapshot.overrides[shortcut.id] !== undefined}
                    recording={recordingId === shortcut.id}
                    format={registry.format}
                    onStartRecording={() => setRecordingId(shortcut.id)}
                    onStopRecording={() => setRecordingId(null)}
                    onRecord={(binding) => {
                      setRecordingId(null);
                      void run(() => registry.setBindings(shortcut.id, [binding]));
                    }}
                    onClear={() => void run(() => registry.setBindings(shortcut.id, []))}
                    onReset={() => void run(() => registry.reset(shortcut.id))}
                  />
                ))}
              </SettingsSection>
            );
          })}
          {filtered.length === 0 ? (
            <p className="text-sm text-muted-foreground">No shortcuts match “{search}”.</p>
          ) : null}
        </div>

        {error ? <p role="alert" className="text-xs text-destructive">{error}</p> : null}

        <ui.AlertDialog open={resetDialogOpen} onOpenChange={setResetDialogOpen}>
          <ui.AlertDialogContent>
            <ui.AlertDialogHeader>
              <ui.AlertDialogTitle>Reset all shortcuts?</ui.AlertDialogTitle>
              <ui.AlertDialogDescription>
                This will revert all your custom keyboard shortcuts to their factory defaults. This action cannot be undone.
              </ui.AlertDialogDescription>
            </ui.AlertDialogHeader>
            <ui.AlertDialogFooter>
              <ui.AlertDialogCancel>Cancel</ui.AlertDialogCancel>
              <ui.AlertDialogAction
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                onClick={() => void run(() => registry.resetAll())}
              >
                Reset All
              </ui.AlertDialogAction>
            </ui.AlertDialogFooter>
          </ui.AlertDialogContent>
        </ui.AlertDialog>
      </div>
    );
  };
}

const plugin: PluginModule = {
  inject: [
    SHORTCUTS_REGISTRY_SERVICE,
    UI_SETTINGS_SECTIONS_SERVICE,
  ],
  async activate(context) {
    const registry = context.get<ShortcutRegistryCapability>("shortcuts.registry");
    const contribution: UiSettingsSectionContribution = {
      id: "shortcuts",
      label: "Shortcuts",
      description: "View and customize keyboard shortcuts.",
      category: "",
      order: 20,
      icon: KeyboardIcon,
      Component: createShortcutSettings(registry),
      searchEntries: [
        { title: "Keyboard shortcuts", description: "View and rebind every command", keywords: "keys bindings hotkeys" },
      ],
    };
    await context.effect(() =>
      context
        .get<UiSettingsSectionRegistry>(UI_SETTINGS_SECTIONS_SERVICE)
        .register(contribution, {
          pluginId: "shortcuts-settings",
          generation: context.generation,
          key: "shortcuts",
        }),
    );
  },
};

export default plugin;
