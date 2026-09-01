import type { PluginModule } from "@termco/kernel";
import { SETTINGS_PREFERENCES_SERVICE, type PreferencesCapability } from "@termco/storage-base";
import {
  TERMINAL_PTY_SERVICE,
  type PtyCapability,
  type PtyShellInfo,
} from "@termco/terminal-base";
import {
  UI_SETTINGS_SECTIONS_SERVICE,
  type UiSettingsSectionContribution,
  type UiSettingsSectionRegistry,
} from "@termco/ui-settings-base";
import {
  WORKSPACE_REGISTRY_SERVICE,
  type WorkspaceCapability,
  type WslDistro,
} from "@termco/workspace-base";
import ui from "@termco/ui";
import { CommandLineIcon } from "@hugeicons/core-free-icons";
import type { ReactNode } from "react";
import {
  resolveTerminalPreferences,
  TERMINAL_KEYS,
  type TerminalPreferences,
} from "./model";

const { useEffect, useState } = ui.React;
const FONT_SIZES = [10, 12, 13, 14, 15, 16, 18, 20, 22, 24];
const LETTER_SPACINGS = [-4, -3, -2, -1, 0, 1, 2, 3, 4];
const SCROLLBACK = [500, 1000, 2000, 5000, 10_000, 25_000];
const SELECT_TRIGGER = "h-[33px] text-xs";

function SettingsCard({ children }: { children: ReactNode }) {
  return (
    <div className="overflow-hidden rounded-lg border border-border bg-card shadow-[var(--shadow-control)]">
      {children}
    </div>
  );
}

function SettingsSection({ label, children }: { label: string; children: ReactNode }) {
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
        <span className="text-xs leading-[1.5] text-muted-foreground">{description}</span>
      </div>
      <div className="flex shrink-0 items-center">{children}</div>
    </div>
  );
}

function FontFamilyInput({
  value,
  onCommit,
}: {
  value: string;
  onCommit(value: string): void;
}) {
  const [draft, setDraft] = useState(value);
  useEffect(() => setDraft(value), [value]);
  const commit = () => {
    const next = draft.trim();
    if (next !== draft) setDraft(next);
    if (next !== value) onCommit(next);
  };
  return (
    <SettingRow
      title="Font family"
      description={'Nerd Font name for icons (e.g. "CaskaydiaCove Nerd Font Mono"). Leave blank to auto-detect.'}
    >
      <input
        type="text"
        value={draft}
        placeholder="Auto-detect"
        onChange={(event) => setDraft(event.target.value)}
        onBlur={commit}
        onKeyDown={(event) => {
          if (event.key === "Enter") event.currentTarget.blur();
        }}
        className="h-8 w-48 rounded-md border border-border bg-background px-2.5 text-xs outline-none focus:border-foreground/40"
      />
    </SettingRow>
  );
}

function SelectControl({
  value,
  width,
  options,
  onChange,
}: {
  value: string;
  width: string;
  options: Array<{ value: string; label: string }>;
  onChange(value: string): void;
}) {
  return (
    <ui.Select value={value} onValueChange={onChange}>
      <ui.SelectTrigger value={value} className={`${SELECT_TRIGGER} ${width}`}>
        <ui.SelectValue />
      </ui.SelectTrigger>
      <ui.SelectContent>
        {options.map((option) => (
          <ui.SelectItem key={option.value} value={option.value} className="text-xs">
            {option.label}
          </ui.SelectItem>
        ))}
      </ui.SelectContent>
    </ui.Select>
  );
}

export function createTerminalSettings(
  preferences: PreferencesCapability,
  pty: PtyCapability,
  workspace: WorkspaceCapability,
) {
  return function TerminalSettings() {
    const [state, setState] = useState<TerminalPreferences | null>(null);
    const [shells, setShells] = useState<PtyShellInfo[]>([]);
    const [distros, setDistros] = useState<WslDistro[]>([]);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
      let active = true;
      const dispose = preferences.subscribe((key, value) => {
        if (!TERMINAL_KEYS.includes(key as keyof TerminalPreferences)) return;
        setState((current) =>
          current
            ? resolveTerminalPreferences({ ...current, [key]: value })
            : current,
        );
      });
      void preferences.getMany(TERMINAL_KEYS).then(
        (stored) => {
          if (active) setState(resolveTerminalPreferences(stored));
        },
        (cause) => {
          if (active) setError(cause instanceof Error ? cause.message : String(cause));
        },
      );
      void Promise.resolve()
        .then(() => pty.listShells())
        .then((nextShells) => {
          if (active) setShells(nextShells);
        })
        .catch(() => undefined);
      void Promise.resolve()
        .then(() => workspace.listWslDistros())
        .then((nextDistros) => {
          if (active) setDistros(nextDistros);
        })
        .catch(() => undefined);
      return () => {
        active = false;
        dispose();
      };
    }, []);

    const update = async <K extends keyof TerminalPreferences>(
      key: K,
      value: TerminalPreferences[K],
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
      return <div data-testid="terminal-settings-section">Loading terminal settings…</div>;
    }

    const selectedShell = shells.find((shell) => shell.path === state.terminalShell);
    const workspaceOptions = [
      { value: "local", label: "Windows" },
      ...distros.map((distro) => ({ value: `wsl:${distro.name}`, label: `WSL: ${distro.name}` })),
    ];
    if (
      state.defaultWorkspaceEnv.startsWith("wsl:") &&
      !distros.some((distro) => `wsl:${distro.name}` === state.defaultWorkspaceEnv)
    ) {
      workspaceOptions.push({
        value: state.defaultWorkspaceEnv,
        label: `${state.defaultWorkspaceEnv.slice(4)} (unavailable)`,
      });
    }

    return (
      <div
        data-testid="terminal-settings-section"
        className="flex flex-col gap-[26px]"
      >
        <SettingsSection label="Rendering">
          <SettingRow
            title="Cursor blinking"
            description="Blink the terminal cursor. Off by default for lower idle CPU, matching VS Code and the macOS terminal."
          >
            <ui.Switch
              checked={state.terminalCursorBlink}
              onCheckedChange={(value) => void update("terminalCursorBlink", value)}
            />
          </SettingRow>
          <FontFamilyInput
            value={state.terminalFontFamily}
            onCommit={(value) => void update("terminalFontFamily", value)}
          />
          <SettingRow title="Font weight" description="Thickness of terminal characters.">
            <SelectControl
              value={state.terminalFontWeight}
              width="w-32"
              options={[
                { value: "normal", label: "Normal" },
                { value: "500", label: "Medium" },
                { value: "600", label: "Semi-Bold" },
                { value: "bold", label: "Bold" },
              ]}
              onChange={(value) => void update("terminalFontWeight", value)}
            />
          </SettingRow>
          <SettingRow title="Font size" description="Terminal text size.">
            <SelectControl
              value={String(state.terminalFontSize)}
              width="w-32"
              options={FONT_SIZES.map((value) => ({ value: String(value), label: `${value} px` }))}
              onChange={(value) => void update("terminalFontSize", Number(value))}
            />
          </SettingRow>
          <SettingRow
            title="Letter spacing"
            description="Extra horizontal space between characters (px). Use negative values to tighten Nerd Fonts."
          >
            <SelectControl
              value={String(state.terminalLetterSpacing)}
              width="w-32"
              options={LETTER_SPACINGS.map((value) => ({
                value: String(value),
                label: `${value > 0 ? `+${value}` : value} px`,
              }))}
              onChange={(value) => void update("terminalLetterSpacing", Number(value))}
            />
          </SettingRow>
        </SettingsSection>

        <SettingsSection label="Shell">
          <SettingRow
            title="Integrated terminal shell"
            description={
              selectedShell?.integrated === false
                ? "Command blocks and directory tracking are unavailable for this shell."
                : distros.length > 0
                  ? "Shell for the integrated terminal. WSL rigs use the distro login shell. Existing tabs keep their shell."
                  : "Shell for new terminal tabs. Existing tabs keep their shell."
            }
          >
            <SelectControl
              value={state.terminalShell || "auto"}
              width="w-44"
              options={[
                { value: "auto", label: "Auto" },
                ...shells.map((shell) => ({ value: shell.path, label: shell.name })),
              ]}
              onChange={(value) => void update("terminalShell", value === "auto" ? "" : value)}
            />
          </SettingRow>
          {distros.length > 0 || state.defaultWorkspaceEnv !== "local" ? (
            <SettingRow
              title="Rig environment"
              description="Where new rigs run, terminal and AI agent alike: Windows or a WSL distro. Existing rigs keep theirs; switch any from the status bar."
            >
              <SelectControl
                value={state.defaultWorkspaceEnv}
                width="w-44"
                options={workspaceOptions}
                onChange={(value) => void update("defaultWorkspaceEnv", value)}
              />
            </SettingRow>
          ) : null}
          <SettingRow
            title="Scrollback"
            description="Lines of history kept per terminal. Higher uses more RAM (~3 KB / line). Applies to newly opened terminals."
          >
            <SelectControl
              value={String(state.terminalScrollback)}
              width="w-40"
              options={SCROLLBACK.map((value) => ({
                value: String(value),
                label: `${value.toLocaleString()} lines`,
              }))}
              onChange={(value) => void update("terminalScrollback", Number(value))}
            />
          </SettingRow>
          <SettingRow
            title="Reconnect SSH rigs on startup"
            description="Open your SSH connections when the app starts so panels and terminals resume where you left off. Turn off to connect only when you open a rig."
          >
            <ui.Switch
              checked={state.reconnectSshOnStartup}
              onCheckedChange={(value) => void update("reconnectSshOnStartup", value)}
            />
          </SettingRow>
        </SettingsSection>
        {error ? <p role="alert" className="text-xs text-destructive">{error}</p> : null}
      </div>
    );
  };
}

const plugin: PluginModule = {
  inject: [
    SETTINGS_PREFERENCES_SERVICE,
    TERMINAL_PTY_SERVICE,
    WORKSPACE_REGISTRY_SERVICE,
    UI_SETTINGS_SECTIONS_SERVICE,
  ],
  async activate(context) {
    const contribution: UiSettingsSectionContribution = {
      id: "terminal",
      label: "Terminal",
      description: "Rendering, fonts, shell, and scrollback.",
      category: "Workspace",
      order: 30,
      icon: CommandLineIcon,
      Component: createTerminalSettings(
        context.get("settings.preferences"),
        context.get("terminal.pty"),
        context.get("workspace.registry"),
      ),
      searchEntries: [
        { title: "Cursor blinking", description: "Blink the terminal cursor", keywords: "caret" },
        { title: "Font family", description: "Nerd Font name for terminal icons", keywords: "typeface nerd font" },
        { title: "Font weight", description: "Thickness of terminal characters", keywords: "" },
        { title: "Font size", description: "Terminal text size", keywords: "" },
        { title: "Letter spacing", description: "Extra horizontal space between characters", keywords: "tracking kerning" },
        { title: "Integrated terminal shell", description: "Which shell new terminal tabs launch", keywords: "zsh bash fish powershell" },
        { title: "Rig environment", description: "Where new rigs run: Windows or a WSL distro", keywords: "wsl workspace env" },
        { title: "Scrollback", description: "Lines of history kept per terminal", keywords: "buffer history" },
        { title: "Reconnect SSH rigs on startup", description: "Resume remote sessions automatically", keywords: "ssh remote" },
      ],
    };
    await context.effect(() =>
      context
        .get<UiSettingsSectionRegistry>(UI_SETTINGS_SECTIONS_SERVICE)
        .register(contribution, {
          pluginId: "terminal-settings",
          generation: context.generation,
          key: "terminal",
        }),
    );
  },
};

export default plugin;
