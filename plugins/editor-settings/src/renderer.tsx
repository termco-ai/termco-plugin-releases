import type { PluginModule } from "@termco/kernel";
import type { PreferencesCapability } from "@termco/storage-base";
import type {
  UiSettingsSectionContribution,
  UiSettingsSectionRegistry,
} from "@termco/ui-settings-base";
import ui from "@termco/ui";
import { CodeIcon } from "@hugeicons/core-free-icons";
import type { ReactNode } from "react";
import {
  clampAutoSaveDelay,
  EDITOR_KEYS,
  type EditorPreferences,
  resolveEditorPreferences,
} from "./model";
import { SETTINGS_PREFERENCES_SERVICE } from "@termco/storage-base";
import { UI_SETTINGS_SECTIONS_SERVICE } from "@termco/ui-settings-base";

const { useEffect, useState } = ui.React;

function SettingsCard({ children }: { children: ReactNode }) {
  return (
    <div className="overflow-hidden rounded-lg border border-border bg-card shadow-[var(--shadow-control)]">
      {children}
    </div>
  );
}

function SettingRow({
  title,
  description,
  children,
}: {
  title: ReactNode;
  description: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="flex items-center gap-4 border-t border-border px-4 py-(--settings-row-pad) first:border-t-0 hover:bg-accent/35">
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="font-medium text-sm">{title}</span>
        <span className="text-xs leading-[1.5] text-muted-foreground">
          {description}
        </span>
      </div>
      <div className="flex shrink-0 items-center">{children}</div>
    </div>
  );
}

function AutoSaveDelayInput({
  value,
  onCommit,
}: {
  value: number;
  onCommit(value: number): void;
}) {
  const [draft, setDraft] = useState(String(value));
  useEffect(() => setDraft(String(value)), [value]);

  const commit = () => {
    const parsed = Number(draft);
    if (!Number.isFinite(parsed)) {
      setDraft(String(value));
      return;
    }
    const next = clampAutoSaveDelay(parsed);
    setDraft(String(next));
    if (next !== value) onCommit(next);
  };

  return (
    <SettingRow
      title="Auto save delay"
      description="Delay before unsaved changes are saved automatically."
    >
      <div className="flex items-center gap-2">
        <ui.Input
          type="number"
          min={100}
          max={60_000}
          step={100}
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onBlur={commit}
          onKeyDown={(event) => {
            if (event.key === "Enter") event.currentTarget.blur();
          }}
          className="h-8 w-20 rounded-md border border-border bg-background px-2.5 text-right text-xs md:text-xs tabular-nums outline-none focus:border-foreground/40 focus-visible:ring-0 focus-visible:border-foreground/40 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
        />
        <span className="text-xs text-muted-foreground">ms</span>
      </div>
    </SettingRow>
  );
}

export function createEditorSettings(preferences: PreferencesCapability) {
  return function EditorSettings() {
    const [state, setState] = useState<EditorPreferences | null>(null);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
      let active = true;
      const dispose = preferences.subscribe((key, value) => {
        if (!EDITOR_KEYS.includes(key as keyof EditorPreferences)) return;
        setState((current) =>
          current
            ? resolveEditorPreferences({ ...current, [key]: value })
            : current,
        );
      });
      void preferences.getMany(EDITOR_KEYS).then(
        (stored) => {
          if (active) setState(resolveEditorPreferences(stored));
        },
        (cause) => {
          if (active) setError(cause instanceof Error ? cause.message : String(cause));
        },
      );
      return () => {
        active = false;
        dispose();
      };
    }, []);

    const update = async <K extends keyof EditorPreferences>(
      key: K,
      value: EditorPreferences[K],
    ) => {
      if (!state) return;
      const previous = state[key];
      setState({ ...state, [key]: value });
      setError(null);
      try {
        await preferences.set(key, value);
      } catch (cause) {
        setState((current) =>
          current ? { ...current, [key]: previous } : current,
        );
        setError(cause instanceof Error ? cause.message : String(cause));
      }
    };

    if (!state) {
      return <div data-testid="editor-settings-section">Loading editor preferences…</div>;
    }

    return (
      <div
        data-testid="editor-settings-section"
        className="flex flex-col gap-[26px]"
      >
        <section>
          <div className="termco-section-label mb-2">Behavior</div>
          <SettingsCard>
            <SettingRow
              title="Vim mode"
              description="Enable Vim keybindings in the code editor."
            >
              <ui.Switch
                checked={state.vimMode}
                onCheckedChange={(value) => void update("vimMode", value)}
              />
            </SettingRow>
            <SettingRow
              title="Word wrap"
              description="Wrap long lines instead of scrolling horizontally."
            >
              <ui.Switch
                checked={state.editorWordWrap}
                onCheckedChange={(value) => void update("editorWordWrap", value)}
              />
            </SettingRow>
            <SettingRow
              title="Format on save"
              description="Format with the project's formatter (Biome, Prettier, dprint) or the language server before saving. Does nothing when neither exists."
            >
              <ui.Switch
                checked={state.editorFormatOnSave}
                onCheckedChange={(value) => void update("editorFormatOnSave", value)}
              />
            </SettingRow>
            <SettingRow
              title="Auto save"
              description="Automatically save files after a delay when changes are detected."
            >
              <ui.Switch
                checked={state.editorAutoSave}
                onCheckedChange={(value) => void update("editorAutoSave", value)}
              />
            </SettingRow>
            {state.editorAutoSave ? (
              <AutoSaveDelayInput
                value={state.editorAutoSaveDelay}
                onCommit={(value) => void update("editorAutoSaveDelay", value)}
              />
            ) : null}
          </SettingsCard>
        </section>
        {error ? <p role="alert" className="text-xs text-destructive">{error}</p> : null}
      </div>
    );
  };
}

const plugin: PluginModule = {
  inject: [
    SETTINGS_PREFERENCES_SERVICE,
    UI_SETTINGS_SECTIONS_SERVICE,
  ],
  async activate(context) {
    const preferences = context.get<PreferencesCapability>("settings.preferences");
    const contribution: UiSettingsSectionContribution = {
      id: "editor",
      label: "Editor",
      description: "Keybindings, wrapping, and saving.",
      category: "Workspace",
      order: 40,
      icon: CodeIcon,
      Component: createEditorSettings(preferences),
      searchEntries: [
        { title: "Vim mode", description: "Vim keybindings in the code editor", keywords: "modal keys" },
        { title: "Word wrap", description: "Wrap long lines instead of scrolling", keywords: "" },
        { title: "Format on save", description: "Run the project formatter before saving", keywords: "biome prettier dprint" },
        { title: "Auto save", description: "Save automatically after a short pause", keywords: "autosave delay" },
      ],
    };
    await context.effect(() =>
      context
        .get<UiSettingsSectionRegistry>("ui.settings.sections")
        .register(contribution, { pluginId: "editor-settings", generation: context.generation, key: contribution.id }),
    );
  },
};

export default plugin;
