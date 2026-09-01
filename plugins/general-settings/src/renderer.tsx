import type { DesktopIntegrationCapability } from "@termco/desktop-base";
import type { PluginModule } from "@termco/kernel";
import type { PreferencesCapability } from "@termco/storage-base";
import type {
  UiSettingsSectionContribution,
  UiSettingsSectionRegistry,
} from "@termco/ui-settings-base";
import ui from "@termco/ui";
import { Settings01Icon } from "@hugeicons/core-free-icons";
import type { ReactNode } from "react";
import {
  clampZoom,
  GENERAL_KEYS,
  type GeneralPreferences,
  resolveGeneralPreferences,
} from "./model";
import { DESKTOP_INTEGRATION_SERVICE } from "@termco/desktop-base";
import { UI_SETTINGS_SECTIONS_SERVICE } from "@termco/ui-settings-base";
import { SETTINGS_PREFERENCES_SERVICE } from "@termco/storage-base";

const { useEffect, useState } = ui.React;

type BooleanPreference = keyof Omit<GeneralPreferences, "zoomLevel">;

const groups: Array<{
  label: string;
  rows: Array<{
    key: BooleanPreference;
    title: string;
    description: string;
  }>;
}> = [
  {
    label: "Startup",
    rows: [
      {
        key: "autostart",
        title: "Launch at login",
        description: "Open Termco automatically when you sign in.",
      },
      {
        key: "restoreWindowState",
        title: "Restore window position & size",
        description:
          "Reopen the main window where you left it. Applies on next launch.",
      },
    ],
  },
  {
    label: "Files",
    rows: [
      {
        key: "showHidden",
        title: "Show hidden files",
        description:
          "Include dot-prefixed files and folders (.env, .gitignore, .config) in the file explorer and search.",
      },
      {
        key: "explorerGitDecorations",
        title: "Git decorations",
        description:
          "Tint changed files and dim gitignored entries in the file explorer.",
      },
    ],
  },
  {
    label: "Agents",
    rows: [
      {
        key: "agentNotifications",
        title: "Coding agent notifications",
        description:
          "Alert when Claude Code or Codex running in a terminal needs your input or finishes. Desktop notification when Termco is unfocused, in-app otherwise.",
      },
      {
        key: "agentAutoApprove",
        title: "Run tools without asking (unsafe)",
        description:
          "The agent runs edits, file changes, git, containers, and shell commands automatically — no approval cards. Catastrophic shell commands (rm -rf, disk writes, force-push, sudo, curl | sh…) still ask first. Leave off unless you're comfortable with the agent acting unattended.",
      },
      {
        key: "richChatUi",
        title: "Rich views in chat",
        description:
          "Let the agent draw tables, charts, diffs, file trees and clickable finding lists instead of describing data in prose. Turning this off removes the tools from the model entirely, so they cost no tokens — existing views stay in the transcript as plain tool rows.",
      },
    ],
  },
];

function SettingsCard({ children }: { children: ReactNode }) {
  return (
    <div className="overflow-hidden rounded-lg border border-border bg-card shadow-[var(--shadow-control)]">
      {children}
    </div>
  );
}

function SettingsSection({
  label,
  children,
}: {
  label: ReactNode;
  children: ReactNode;
}) {
  return (
    <section>
      <div className="termco-section-label mb-2">{label}</div>
      <SettingsCard>{children}</SettingsCard>
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

export function createGeneralSettings(
  preferences: PreferencesCapability,
  desktop: DesktopIntegrationCapability,
) {
  return function GeneralSettings() {
    const [state, setState] = useState<GeneralPreferences | null>(null);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
      let active = true;
      const dispose = preferences.subscribe((key, value) => {
        if (!GENERAL_KEYS.includes(key as keyof GeneralPreferences)) return;
        setState((current) => {
          if (!current) return current;
          if (key === "zoomLevel") {
            return { ...current, zoomLevel: clampZoom(value) };
          }
          if (typeof value !== "boolean") return current;
          return { ...current, [key]: value };
        });
      });
      void (async () => {
        let stored: Record<string, unknown>;
        let resolved: GeneralPreferences;
        try {
          stored = await preferences.getMany(GENERAL_KEYS);
          resolved = resolveGeneralPreferences(stored);
          if (active) setState(resolved);
        } catch (cause) {
          if (active) {
            setError(cause instanceof Error ? cause.message : String(cause));
          }
          return;
        }

        try {
          const operatingSystemAutostart = await Promise.resolve(
            desktop.autostartEnabled(),
          );
          if (!active) return;
          const reconciled = {
            ...resolved,
            autostart: operatingSystemAutostart,
          };
          if (stored.autostart !== operatingSystemAutostart) {
            await preferences.set("autostart", operatingSystemAutostart);
          }
          if (active) setState(reconciled);
        } catch {
          // OS autostart discovery is optional. Stored preferences remain usable.
        }
      })();
      return () => {
        active = false;
        dispose();
      };
    }, []);

    const update = async <K extends keyof GeneralPreferences>(
      key: K,
      value: GeneralPreferences[K],
    ) => {
      if (!state) return;
      const previous = state[key];
      setState({ ...state, [key]: value });
      setError(null);
      try {
        if (key === "autostart") {
          await Promise.resolve(desktop.setAutostart(value as boolean));
        }
        await preferences.set(key, value);
      } catch (cause) {
        setState((current) =>
          current ? { ...current, [key]: previous } : current,
        );
        if (key === "autostart") {
          console.error("autostart toggle failed", cause);
          return;
        }
        setError(cause instanceof Error ? cause.message : String(cause));
      }
    };

    if (!state) {
      return (
        <div data-testid="general-settings-section">
          Loading general preferences…
        </div>
      );
    }

    return (
      <div
        data-testid="general-settings-section"
        className="flex flex-col gap-[26px]"
      >
        {groups.map((group) => (
          <SettingsSection key={group.label} label={group.label}>
            {group.rows.map((row) => (
              <SettingRow
                key={row.key}
                title={row.title}
                description={row.description}
              >
                <ui.Switch
                  checked={state[row.key]}
                  onCheckedChange={(value) =>
                    void update(row.key, value)
                  }
                />
              </SettingRow>
            ))}
          </SettingsSection>
        ))}
        <SettingsSection label="Interface">
          <SettingRow title="Zoom level" description="Scale the entire interface.">
            <div className="flex items-center gap-3">
              <ui.Slider
                value={[state.zoomLevel]}
                min={0.5}
                max={2}
                step={0.05}
                onValueChange={(value) =>
                  void update("zoomLevel", clampZoom(value[0]))
                }
                className="w-[170px]"
                aria-label="UI zoom level"
              />
              <span className="w-11 text-right font-mono text-xs tabular-nums text-muted-foreground">
                {Math.round(state.zoomLevel * 100)}%
              </span>
            </div>
          </SettingRow>
        </SettingsSection>
        {error ? (
          <p role="alert" className="text-xs text-destructive">
            {error}
          </p>
        ) : null}
      </div>
    );
  };
}

const plugin: PluginModule = {
  inject: [
    SETTINGS_PREFERENCES_SERVICE,
    DESKTOP_INTEGRATION_SERVICE,
    UI_SETTINGS_SECTIONS_SERVICE,
  ],
  async activate(context) {
    const preferences = context.get<PreferencesCapability>(
      "settings.preferences",
    );
    const desktop = context.get<DesktopIntegrationCapability>(
      "desktop.integration",
    );
    const contribution: UiSettingsSectionContribution = {
      id: "general",
      label: "General",
      description: "Startup, files, agents, and interface scale.",
      category: "",
      order: 0,
      icon: Settings01Icon,
      Component: createGeneralSettings(preferences, desktop),
      searchEntries: [
        { title: "Launch at login", description: "Open Termco automatically when you sign in.", keywords: "autostart startup boot" },
        { title: "Restore window position & size", description: "Reopen the main window where you left it.", keywords: "layout geometry" },
        { title: "Show hidden files", description: "Include dotfiles in explorer and search.", keywords: "dotfiles explorer" },
        { title: "Git decorations", description: "Show repository state in the explorer.", keywords: "status colors" },
        { title: "Coding agent notifications", description: "Alert when an agent needs input.", keywords: "notify ping agents" },
        { title: "Run tools without asking", description: "Auto-run ordinary agent tools without approval cards.", keywords: "auto approve unsafe yolo" },
        { title: "Rich views in chat", description: "Allow tables, charts, diffs, and findings.", keywords: "generative ui visual" },
        { title: "Zoom level", description: "Scale the entire interface.", keywords: "ui scale size" },
      ],
    };
    await context.effect(() =>
      context
        .get<UiSettingsSectionRegistry>("ui.settings.sections")
        .register(contribution, { pluginId: "general-settings", generation: context.generation, key: contribution.id }),
    );
  },
};

export default plugin;
