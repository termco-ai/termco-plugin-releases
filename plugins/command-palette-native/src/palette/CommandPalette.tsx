// The command palette container: owns the query/mode/page state, the async
// search hooks, and the action callbacks, then delegates rendering of each
// mode to a dedicated view component. Pure ranking/formatting lives in `lib/`.

import type {
  WorkspaceFileIconsCapability,
  WorkspaceFilesCapability,
} from "@termco/files-base";
import type { ShortcutRegistryCapability } from "@termco/shortcuts-base";
import type { ShellHistoryCapability } from "@termco/terminal-base";
import type { UiCommandPaletteMode } from "@termco/ui-overlays-base";
import type { UiThemeCapability } from "@termco/ui-theme-base";
import type { WorkspaceEnv } from "@termco/workspace-base";
import { createPortal } from "react-dom";
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  useSyncExternalStore,
} from "react";
import { Command, CommandList, CommandPrimitive } from "../ui";
import { CommandsView } from "./components/CommandsView";
import { ContentSearchView } from "./components/ContentSearchView";
import { HistoryView } from "./components/HistoryView";
import { PalettePopout } from "./components/PalettePopout";
import { ModeChips, type PaletteChipMode } from "./components/ModeChips";
import { SearchModesView } from "./components/SearchModesView";
import { ThemesView } from "./components/ThemesView";
import { useCommandHistory } from "./hooks/useCommandHistory";
import { useContentSearch } from "./hooks/useContentSearch";
import { fuzzyBest } from "./lib/fuzzy";
import { parseQuery } from "./lib/mode";
import { mruSnapshot, recordUse } from "./lib/mru";
import { rankCommands } from "./lib/rankCommands";
import type { PaletteItem } from "./types";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialMode?: UiCommandPaletteMode;
  query: string;
  onQueryChange: (query: string) => void;
  commandItems: PaletteItem[];
  workspaceRoot: string | null;
  workspace: WorkspaceEnv;
  onOpenContentHit: (path: string, line: number) => void;
  insertCommand: ((cmd: string) => void) | null;
  inputSlot: HTMLElement | null;
  anchor: HTMLElement | null;
  files: WorkspaceFilesCapability;
  fileIcons: WorkspaceFileIconsCapability;
  historyProvider: ShellHistoryCapability;
  shortcuts: ShortcutRegistryCapability;
  theme: UiThemeCapability;
};

const THEME_PREVIEW_DELAY_MS = 140;

/**
 * The workspace command palette dialog.
 *
 * Beyond running commands it hosts three sub-modes selected by a leading sigil
 * (`>` history, `#` content, `?` help) plus a themes page, all driven from a
 * single input. Mode is derived from the parsed query; each mode renders its
 * own view component. Opening resets state (the input focuses itself via
 * cmdk's autoFocus); closing clears any live theme preview.
 */
export function CommandPalette({
  open,
  onOpenChange,
  initialMode,
  query,
  onQueryChange,
  commandItems,
  workspaceRoot,
  workspace,
  onOpenContentHit,
  insertCommand,
  inputSlot,
  anchor,
  files,
  fileIcons,
  historyProvider,
  shortcuts,
  theme,
}: Props) {
  const [value, setValue] = useState("");
  const [page, setPage] = useState<"root" | "themes">("root");
  const themeSnapshot = useSyncExternalStore(
    theme.subscribe,
    theme.snapshot,
    theme.snapshot,
  );
  useSyncExternalStore(
    shortcuts.subscribe,
    shortcuts.snapshot,
    shortcuts.snapshot,
  );

  const parsed = parseQuery(query);
  const inThemes = page === "themes";
  const themeFilter = inThemes ? query.trim() : "";

  const content = useContentSearch(
    workspaceRoot,
    parsed.term,
    open && !inThemes && parsed.mode === "content",
    files,
    workspace,
  );
  const history = useCommandHistory(
    parsed.term,
    open && !inThemes && parsed.mode === "history",
    historyProvider,
    workspace,
  );

  const mru = useMemo(() => (open ? mruSnapshot() : {}), [open]);

  const rankedCommands = useMemo(() => {
    if (inThemes || parsed.mode !== "commands") return [];
    return rankCommands(commandItems, parsed.term, mru);
  }, [commandItems, parsed.term, parsed.mode, inThemes, mru]);

  const themes = useMemo(() => {
    if (!inThemes) return [];
    const all = [...themeSnapshot.themes];
    const q = themeFilter.toLowerCase();
    if (!q) return all;
    return all
      .map((t) => ({ t, s: fuzzyBest(q, [t.name, t.id]) }))
      .filter((x) => x.s !== null)
      .sort((a, b) => (b.s ?? 0) - (a.s ?? 0))
      .map((x) => x.t);
  }, [inThemes, themeFilter, themeSnapshot.themes]);

  const resetPalette = useCallback(() => {
    onQueryChange("");
    setValue("");
    setPage("root");
    void theme.mutate({ type: "preview-theme", id: null });
  }, [onQueryChange, theme]);

  const handleOpenChange = useCallback(
    (next: boolean) => {
      if (!next) resetPalette();
      onOpenChange(next);
    },
    [onOpenChange, resetPalette],
  );

  useEffect(() => {
    if (!open) return;
    setPage(initialMode === "themes" ? "themes" : "root");
  }, [open, initialMode]);

  useEffect(() => {
    if (!inThemes || !value.startsWith("theme:")) return;
    const id = value.slice("theme:".length);
    if (id === "back") return;
    const handle = window.setTimeout(
      () => void theme.mutate({ type: "preview-theme", id }),
      THEME_PREVIEW_DELAY_MS,
    );
    return () => window.clearTimeout(handle);
  }, [value, inThemes, theme]);

  const runAfterClose = useCallback(
    (fn: () => void) => {
      handleOpenChange(false);
      window.setTimeout(fn, 0);
    },
    [handleOpenChange],
  );

  const enterThemes = useCallback(() => {
    setPage("themes");
    onQueryChange("");
    setValue("");
  }, [onQueryChange]);

  const exitThemes = useCallback(() => {
    void theme.mutate({ type: "preview-theme", id: null });
    setPage("root");
    onQueryChange("");
    setValue("");
  }, [onQueryChange, theme]);

  const runCommand = useCallback(
    (item: PaletteItem) => {
      if (item.disabledReason) return;
      if (item.id === "theme.pick") return enterThemes();
      if (item.id === "search.content") return onQueryChange("#");
      if (item.id === "history.open") return onQueryChange(">");
      recordUse(item.id);
      runAfterClose(item.run);
    },
    [enterThemes, onQueryChange, runAfterClose],
  );

  const openContent = useCallback(
    (path: string, line: number) => {
      runAfterClose(() => onOpenContentHit(path, line));
    },
    [onOpenContentHit, runAfterClose],
  );

  const runHistory = useCallback(
    (cmd: string) => {
      if (!insertCommand) return;
      runAfterClose(() => insertCommand(cmd));
    },
    [insertCommand, runAfterClose],
  );

  const commitTheme = useCallback(
    (id: string) => {
      void theme.mutate({ type: "set-theme", id });
      handleOpenChange(false);
    },
    [theme, handleOpenChange],
  );

  const onKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (!inThemes) return;
      if (e.key === "Escape" || (e.key === "Backspace" && query.length === 0)) {
        e.preventDefault();
        e.stopPropagation();
        exitThemes();
      }
    },
    [inThemes, query, exitThemes],
  );

  const chipMode: PaletteChipMode = inThemes
    ? "themes"
    : parsed.mode === "history"
      ? "history"
      : parsed.mode === "content"
        ? "content"
        : "commands";

  const pickMode = useCallback(
    (mode: PaletteChipMode) => {
      if (mode === "themes") return enterThemes();
      if (inThemes) exitThemes();
      setValue("");
      onQueryChange(
        mode === "history" ? ">" : mode === "content" ? "#" : "",
      );
    },
    [enterThemes, exitThemes, inThemes, onQueryChange],
  );

  const placeholder = inThemes
    ? "Search themes..."
    : parsed.mode === "content"
      ? "Find text in files..."
      : parsed.mode === "history"
        ? "Search command history..."
        : "Type a command, > for history, # to find in files";

  // The bar in the header chrome *is* this input — portal it up there so one
  // field serves both states, and publish open/close so the bar can merge with
  // the panel and drive its esc chip.
  // Opened by shortcut: the field lives up in the bar, so put the caret there.
  useEffect(() => {
    if (!open || !inputSlot) return;
    inputSlot.querySelector("input")?.focus();
  }, [open, inputSlot]);

  const input = (
    <CommandPrimitive.Input
      data-slot="command-input"
      aria-label="Command palette"
      value={query}
      onValueChange={onQueryChange}
      onFocus={() => {
        if (!open) onOpenChange(true);
      }}
      placeholder={open ? placeholder : "Search or run a command…"}
      className="min-w-0 flex-1 bg-transparent text-xs outline-hidden placeholder:text-muted-foreground disabled:cursor-not-allowed disabled:opacity-50"
    />
  );

  return (
    <Command
      data-testid="command-palette-source"
      shouldFilter={false}
      loop
      value={value}
      onValueChange={setValue}
      onKeyDown={onKeyDown}
      className="contents"
    >
      {inputSlot ? createPortal(input, inputSlot) : null}
      <PalettePopout
        open={open}
        onClose={() => handleOpenChange(false)}
        bar={anchor}
      >
        {/* No bar to live in (compact header, or none mounted): carry the
            field ourselves so the palette is never input-less. */}
        {inputSlot ? null : (
          <div className="flex shrink-0 items-center gap-[11px] border-b border-border/60 px-4 py-3">
            {input}
          </div>
        )}
        <ModeChips active={chipMode} onPick={pickMode} />
        {/* The list scrolls itself; a wrapping scroll area can't clip cmdk's
            own list, which would let it run under the footer. */}
        <CommandList className="max-h-[360px] min-h-0 flex-1 overflow-y-auto p-1.5">
          {inThemes ? (
            <ThemesView
              themes={themes}
              themeId={themeSnapshot.themeId}
              onExit={exitThemes}
              onCommit={commitTheme}
            />
          ) : parsed.mode === "commands" ? (
            <CommandsView
              rankedCommands={rankedCommands}
              shortcuts={shortcuts}
              onRun={runCommand}
            />
          ) : parsed.mode === "content" ? (
            <ContentSearchView
              workspaceRoot={workspaceRoot}
              term={parsed.term}
              content={content}
              onOpen={openContent}
              fileIcons={fileIcons}
            />
          ) : parsed.mode === "history" ? (
            <HistoryView
              insertCommand={insertCommand}
              history={history}
              onRun={runHistory}
            />
          ) : (
            <SearchModesView onPick={onQueryChange} />
          )}
        </CommandList>
        <div className="termco-toolbar flex shrink-0 items-center gap-4 border-t border-border/60 px-4 py-2 font-mono text-xs text-muted-foreground">
          <span>↑↓ navigate</span>
          <span>↵ open</span>
          <span className="ml-auto">
            {/Mac|iPhone|iPad/.test(navigator.platform) ? "⌘" : "Ctrl"}K
          </span>
        </div>
      </PalettePopout>
    </Command>
  );
}
