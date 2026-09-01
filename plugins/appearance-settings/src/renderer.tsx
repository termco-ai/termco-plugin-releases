import {
  EVENTS_APPLICATION_SERVICE,
  type ApplicationEventsCapability,
} from "@termco/events-base";
import type { PluginModule } from "@termco/kernel";
import type {
  UiSettingsSectionContribution,
  UiSettingsSectionRegistry,
} from "@termco/ui-settings-base";
import type {
  ThemeDefinition,
  ThemeModePreference,
  UiThemeCapability,
} from "@termco/ui-theme-base";
import ui from "@termco/ui";
import {
  ComputerIcon,
  Edit02Icon,
  Moon02Icon,
  PaintBoardIcon,
  PlusSignIcon,
  Sun03Icon,
  Tick02Icon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import type { ReactNode } from "react";
import { editorThemesFor } from "./editorThemes";
import { UI_THEME_SERVICE } from "@termco/ui-theme-base";
import { UI_SETTINGS_SECTIONS_SERVICE } from "@termco/ui-settings-base";

const { useMemo, useRef, useState, useSyncExternalStore } = ui.React;
const DEFAULT_THEME_ID = "termco-default";

function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function SettingsCard({ children }: { children: ReactNode }) {
  return (
    <div className="overflow-hidden rounded-lg border border-border bg-card shadow-[var(--shadow-control)]">
      {children}
    </div>
  );
}

function SettingsLabel({ children }: { children: ReactNode }) {
  return <div className="termco-section-label mb-2">{children}</div>;
}

function SettingsGroup({
  label,
  children,
  action,
}: {
  label: ReactNode;
  children: ReactNode;
  action?: ReactNode;
}) {
  return (
    <section>
      {action ? (
        <div className="mb-2 flex items-center justify-between gap-3">
          <div className="termco-section-label">{label}</div>
          {action}
        </div>
      ) : (
        <SettingsLabel>{label}</SettingsLabel>
      )}
      {children}
    </section>
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

const MODES: Array<{
  id: ThemeModePreference;
  label: string;
  hint: string;
  icon: typeof ComputerIcon;
}> = [
  { id: "system", label: "System", hint: "Follow OS", icon: ComputerIcon },
  { id: "light", label: "Light", hint: "Always light", icon: Sun03Icon },
  { id: "dark", label: "Dark", hint: "Always dark", icon: Moon02Icon },
];

function ModeCards({
  mode,
  select,
}: {
  mode: ThemeModePreference;
  select(mode: ThemeModePreference): void;
}) {
  return (
    <div className="grid grid-cols-3 gap-2.5">
      {MODES.map((option) => {
        const active = mode === option.id;
        return (
          <button
            key={option.id}
            type="button"
            onClick={() => select(option.id)}
            aria-label={option.label}
            aria-pressed={active}
            className={ui.cn(
              "flex h-24 cursor-pointer flex-col items-center justify-center rounded-lg border bg-card shadow-[var(--shadow-control)] transition-all",
              active
                ? "border-primary bg-primary/10 text-primary"
                : "border-border/70 bg-card text-muted-foreground hover:border-border hover:text-foreground",
            )}
          >
            <HugeiconsIcon icon={option.icon} size={20} strokeWidth={1.6} />
            <span className="mt-2 text-xs font-medium">{option.label}</span>
            <span className="mt-0.5 text-xs text-muted-foreground">
              {option.hint}
            </span>
          </button>
        );
      })}
    </div>
  );
}

function ThemeCard({
  definition,
  mode,
  selected,
  custom,
  onSelect,
  onEdit,
  onDelete,
}: {
  definition: ThemeDefinition;
  mode: "light" | "dark";
  selected: boolean;
  custom: boolean;
  onSelect(): void;
  onEdit(): void;
  onDelete(): void;
}) {
  const variant =
    definition.variants[mode] ??
    definition.variants.dark ??
    definition.variants.light;
  const colors = variant?.colors;
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      className={ui.cn(
        "group flex cursor-pointer items-center gap-3 rounded-lg border bg-card px-3.5 py-3 text-left shadow-[var(--shadow-control)] transition-all",
        selected ? "border-primary" : "border-border/60 hover:border-border",
      )}
    >
      <span className="flex shrink-0 items-center gap-1">
        <span
          className="h-[26px] w-[7px] rounded-[3px]"
          style={{ background: colors?.primary ?? colors?.accent ?? "var(--accent)" }}
        />
        <span
          className="h-[26px] w-[7px] rounded-[3px]"
          style={{ background: colors?.foreground ?? "var(--foreground)", opacity: 0.7 }}
        />
        <span
          className="h-[26px] w-[7px] rounded-[3px]"
          style={{ background: colors?.muted ?? colors?.background ?? "var(--muted)" }}
        />
      </span>
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="truncate text-sm font-semibold">{definition.name}</span>
        {definition.description ? (
          <span className="truncate text-xs text-muted-foreground">
            {definition.description}
          </span>
        ) : null}
      </span>
      {selected ? (
        <HugeiconsIcon
          icon={Tick02Icon}
          size={16}
          strokeWidth={2}
          className="shrink-0 text-primary"
          aria-label="Selected"
        />
      ) : null}
      {custom ? (
        <span className="ml-1 flex shrink-0 items-center gap-0.5 opacity-0 transition group-hover:opacity-100">
          <span
            role="button"
            tabIndex={0}
            aria-label={`Edit ${definition.name}`}
            className="inline-flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
            onClick={(event) => {
              event.stopPropagation();
              onEdit();
            }}
            onKeyDown={(event) => {
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                event.stopPropagation();
                onEdit();
              }
            }}
          >
            <HugeiconsIcon icon={Edit02Icon} size={12} strokeWidth={1.75} />
          </span>
          <span
            role="button"
            tabIndex={0}
            aria-label={`Remove ${definition.name}`}
            className="inline-flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-destructive"
            onClick={(event) => {
              event.stopPropagation();
              onDelete();
            }}
            onKeyDown={(event) => {
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                event.stopPropagation();
                onDelete();
              }
            }}
          >
            ×
          </span>
        </span>
      ) : null}
    </button>
  );
}

function ImageSlider({
  label,
  value,
  min,
  max,
  step,
  onChange,
  display,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange(value: number): void;
  display: ReactNode;
}) {
  return (
    <div className="flex items-center gap-3.5">
      <span className="w-14 shrink-0 text-xs text-muted-foreground">
        {label}
      </span>
      <ui.Slider
        value={[value]}
        min={min}
        max={max}
        step={step}
        onValueChange={(next) => onChange(next[0] ?? min)}
        className="flex-1"
        aria-label={label}
      />
      <span className="w-10 shrink-0 text-right font-mono text-xs tabular-nums text-muted-foreground">
        {display}
      </span>
    </div>
  );
}

export function createAppearanceSettings(
  theme: UiThemeCapability,
  events: ApplicationEventsCapability,
) {
  return function AppearanceSettings({ dismiss }: { dismiss?: () => void }) {
    const snapshot = useSyncExternalStore(
      theme.subscribe,
      theme.snapshot,
      theme.snapshot,
    );
    const [error, setError] = useState<string | null>(null);
    const themeInput = useRef<HTMLInputElement | null>(null);
    const backgroundInput = useRef<HTMLInputElement | null>(null);
    const customIds = useMemo(
      () => new Set(snapshot.customThemeIds),
      [snapshot.customThemeIds],
    );
    const run = async (operation: () => Promise<unknown>) => {
      setError(null);
      try {
        await operation();
      } catch (cause) {
        setError(message(cause));
      }
    };
    const importThemes = async (files: FileList | null) => {
      if (!files?.length) return;
      setError(null);
      for (const file of Array.from(files)) {
        try {
          const parsed = JSON.parse(await file.text()) as unknown;
          const result = theme.validate(parsed);
          if (!result.ok) throw new Error(result.error);
          await theme.mutate({ type: "save-custom-theme", theme: result.theme });
          await theme.mutate({ type: "set-theme", id: result.theme.id });
        } catch (cause) {
          setError(`${file.name}: ${message(cause)}`);
          return;
        }
      }
    };
    const importBackground = async (files: FileList | null) => {
      const file = files?.[0];
      if (!file) return;
      if (!file.type.startsWith("image/")) {
        setError(`${file.name}: not an image`);
        return;
      }
      await run(() => theme.mutate({ type: "import-background", file }));
    };
    const requestEditor = (request: {
      action: "create";
    } | {
      action: "edit";
      id: string;
    }) => {
      void run(() => theme.mutate({ type: "request-edit", request }));
      dismiss?.();
    };
    const hasBackground =
      snapshot.background.kind === "image" && !!snapshot.background.imageId;

    return (
      <div
        data-testid="appearance-settings-section"
        className="flex flex-col gap-[26px]"
      >
        <SettingsGroup label="Interface mode">
          <ModeCards
            mode={snapshot.mode}
            select={(mode) =>
              void run(() => theme.mutate({ type: "set-mode", mode }))
            }
          />
        </SettingsGroup>

        <div
          role="presentation"
          onDragOver={(event) => {
            event.preventDefault();
            event.dataTransfer.dropEffect = "copy";
          }}
          onDrop={(event) => {
            event.preventDefault();
            void importThemes(event.dataTransfer.files);
          }}
        >
          <SettingsGroup
            label="Color theme"
            action={
              <div className="flex items-center gap-1.5">
                <ui.Button
                  size="sm"
                  className="h-7 gap-1.5 px-2.5 text-xs"
                  onClick={() => requestEditor({ action: "create" })}
                >
                  <HugeiconsIcon icon={PlusSignIcon} size={11} strokeWidth={2} />
                  Create
                </ui.Button>
                <ui.Button
                  variant="outline"
                  size="sm"
                  className="h-7 px-2.5 text-xs"
                  onClick={() => themeInput.current?.click()}
                >
                  Import .termco-theme
                </ui.Button>
                <input
                  ref={themeInput}
                  type="file"
                  accept=".termco-theme,.json,application/json"
                  className="hidden"
                  multiple
                  onChange={(event) => {
                    void importThemes(event.target.files);
                    event.target.value = "";
                  }}
                />
              </div>
            }
          >
            <div className="flex flex-col gap-2">
              <div className="grid grid-cols-2 gap-2.5">
                {snapshot.themes.map((definition) => (
                  <ThemeCard
                    key={definition.id}
                    definition={definition}
                    mode={snapshot.resolvedMode}
                    selected={snapshot.themeId === definition.id}
                    custom={customIds.has(definition.id)}
                    onSelect={() =>
                      void run(() =>
                        theme.mutate({ type: "set-theme", id: definition.id }),
                      )
                    }
                    onEdit={() =>
                      requestEditor({ action: "edit", id: definition.id })
                    }
                    onDelete={() =>
                      void run(async () => {
                        if (snapshot.themeId === definition.id) {
                          await theme.mutate({
                            type: "set-theme",
                            id: DEFAULT_THEME_ID,
                          });
                        }
                        await theme.mutate({
                          type: "delete-custom-theme",
                          id: definition.id,
                        });
                        await Promise.resolve(
                          events.emit("termco://theme-delete", {
                            id: definition.id,
                          }),
                        );
                      })
                    }
                  />
                ))}
              </div>
            </div>
          </SettingsGroup>
        </div>

        <SettingsGroup label="Syntax">
          <SettingsCard>
            <SettingRow
              title="Editor syntax theme"
              description="Syntax colors for the code editor. Auto follows the app theme."
            >
              <ui.Select
                value={snapshot.editorTheme}
                onValueChange={(id) =>
                  void run(() => theme.mutate({ type: "set-editor-theme", id }))
                }
              >
                <ui.SelectTrigger size="sm" className="h-8 w-44 text-xs">
                  <ui.SelectValue />
                </ui.SelectTrigger>
                <ui.SelectContent>
                  <ui.SelectItem value="auto" className="text-xs">
                    Auto (match app theme)
                  </ui.SelectItem>
                  <ui.SelectSeparator />
                  {editorThemesFor(snapshot.resolvedMode).map(
                    ([id, label, mode]) => (
                      <ui.SelectItem
                        key={id}
                        value={id}
                        disabled={mode !== snapshot.resolvedMode}
                        className="text-xs"
                      >
                        {label}
                      </ui.SelectItem>
                    ),
                  )}
                </ui.SelectContent>
              </ui.Select>
            </SettingRow>
          </SettingsCard>
        </SettingsGroup>

        <SettingsGroup label="Desktop background">
          <div
            role="presentation"
            className="rounded-lg border border-dashed border-border bg-card p-4"
            onDragOver={(event) => {
              event.preventDefault();
              event.dataTransfer.dropEffect = "copy";
            }}
            onDrop={(event) => {
              event.preventDefault();
              void importBackground(event.dataTransfer.files);
            }}
          >
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <div className="text-sm">
                  {hasBackground ? "Background image set" : "No background set"}
                </div>
                <div className="mt-0.5 text-xs leading-[1.5] text-muted-foreground">
                  Drop an image anywhere here, or pick one. It's stored on-device
                  and layered behind your workspace.
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                {hasBackground ? (
                  <ui.Button
                    variant="outline"
                    size="sm"
                    className="h-8 px-3 text-xs text-muted-foreground hover:border-destructive hover:text-destructive"
                    onClick={() =>
                      void run(() => theme.mutate({ type: "remove-background" }))
                    }
                  >
                    Remove
                  </ui.Button>
                ) : null}
                <ui.Button
                  variant="outline"
                  size="sm"
                  className="h-8 px-3 text-xs"
                  onClick={() => backgroundInput.current?.click()}
                >
                  {hasBackground ? "Replace" : "Choose image"}
                </ui.Button>
                <input
                  ref={backgroundInput}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(event) => {
                    void importBackground(event.target.files);
                    event.target.value = "";
                  }}
                />
              </div>
            </div>
            {hasBackground ? (
              <div className="mt-4 flex flex-col gap-3.5 border-t border-border/60 pt-4">
                <ImageSlider
                  label="Opacity"
                  value={snapshot.background.opacity}
                  min={0}
                  max={1}
                  step={0.01}
                  display={`${Math.round(snapshot.background.opacity * 100)}%`}
                  onChange={(value) =>
                    void run(() =>
                      theme.mutate({ type: "set-background-opacity", value }),
                    )
                  }
                />
                <ImageSlider
                  label="Blur"
                  value={snapshot.background.blur}
                  min={0}
                  max={64}
                  step={1}
                  display={`${snapshot.background.blur}px`}
                  onChange={(value) =>
                    void run(() =>
                      theme.mutate({ type: "set-background-blur", value }),
                    )
                  }
                />
              </div>
            ) : null}
          </div>
        </SettingsGroup>

        {error ? (
          <div
            role="alert"
            className="rounded-md border border-destructive/40 bg-destructive/10 px-2.5 py-1.5 text-xs text-destructive"
          >
            {error}
          </div>
        ) : null}
      </div>
    );
  };
}

const plugin: PluginModule = {
  inject: [
    UI_THEME_SERVICE,
    EVENTS_APPLICATION_SERVICE,
    UI_SETTINGS_SECTIONS_SERVICE,
  ],
  async activate(context) {
    const theme = context.get<UiThemeCapability>("ui.theme");
    const events = context.get<ApplicationEventsCapability>(
      EVENTS_APPLICATION_SERVICE,
    );
    const contribution: UiSettingsSectionContribution = {
      id: "appearance",
      label: "Appearance",
      description:
        "Mode, color theme, and desktop background.",
      category: "",
      order: 10,
      icon: PaintBoardIcon,
      Component: createAppearanceSettings(theme, events),
      searchEntries: [
        { title: "Interface mode", description: "System, light, or dark", keywords: "dark light theme mode" },
        { title: "Color theme", description: "Pick a built-in or imported theme", keywords: "themes custom import" },
        { title: "Editor syntax theme", description: "Syntax colors for the code editor", keywords: "highlighting code colors" },
        { title: "Desktop background", description: "A background image behind your workspace", keywords: "wallpaper image blur opacity" },
      ],
    };
    await context.effect(() =>
      context
        .get<UiSettingsSectionRegistry>("ui.settings.sections")
        .register(contribution, { pluginId: "appearance-settings", generation: context.generation, key: contribution.id }),
    );
  },
};

export default plugin;
