// @vitest-environment jsdom
import type {
  WorkspaceFileIconsCapability,
  WorkspaceFilesCapability,
} from "@termco/files-base";
import type { ShortcutRegistryCapability } from "@termco/shortcuts-base";
import type { ShellHistoryCapability } from "@termco/terminal-base";
import type { UiThemeCapability } from "@termco/ui-theme-base";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CommandPalette } from "./CommandPalette";
import type { PaletteItem } from "./types";
import { MemoryStorage } from "./testStorage";

class ResizeObserverStub { observe() {} unobserve() {} disconnect() {} }

const mutate = vi.fn(async () => ({}));
const historyList = vi.fn(async () => [] as string[]);
const grepInteractive = vi.fn(
  async (): Promise<{
    hits: Array<{ path: string; rel: string; line: number; text: string }>;
  }> => ({ hits: [] }),
);
const themeSnapshot = {
    revision: 0, mode: "dark", resolvedMode: "dark", themeId: "nord",
    themes: [
      { id: "nord", name: "Nord", variants: {} },
      { id: "dracula", name: "Dracula", variants: {} },
      { id: "custom-1", name: "My Custom", variants: {} },
    ],
    customThemeIds: ["custom-1"], editorTheme: "auto",
    background: { kind: "none", imageId: null, opacity: 1, blur: 0 },
  } as const;
const theme: UiThemeCapability = {
  Root: ({ children }) => children,
  snapshot: () => themeSnapshot,
  subscribe: () => () => {}, mutate,
  validate: () => ({ ok: false, error: "unused" }),
  resolveEditorTheme: () => "auto",
};
const shortcutSnapshot = {
  revision: 0, groups: [], shortcuts: [], overrides: {},
} as const;
const shortcuts: ShortcutRegistryCapability = {
  snapshot: () => shortcutSnapshot,
  subscribe: () => () => {}, bindings: () => [], match: () => false,
  format: () => [], useHandlers: () => {}, setBindings: async () => {}, reset: async () => {},
  resetAll: async () => {},
};
const files = { grepInteractive } as unknown as WorkspaceFilesCapability;
const historyProvider = { list: historyList } as unknown as ShellHistoryCapability;
const fileIcons: WorkspaceFileIconsCapability = {
  fileIconUrl: (name) => `icon://${name}`,
  folderIconUrl: () => "icon://folder",
};

beforeEach(() => {
  vi.stubGlobal("ResizeObserver", ResizeObserverStub);
  vi.stubGlobal("localStorage", new MemoryStorage());
  window.HTMLElement.prototype.scrollIntoView = vi.fn();
  localStorage.clear();
  mutate.mockClear();
  historyList.mockReset();
  historyList.mockResolvedValue([]);
  grepInteractive.mockReset();
  grepInteractive.mockResolvedValue({ hits: [] });
});
afterEach(cleanup);

function items(): PaletteItem[] {
  return [
    { id: "settings.open", title: "Open settings", description: "Configure the application.", group: "General", run: vi.fn() },
    { id: "theme.pick", title: "Change theme...", group: "General", run: vi.fn() },
    { id: "tab.new", title: "New terminal", group: "Tabs", run: vi.fn() },
  ];
}

function setup(overrides: Partial<Parameters<typeof CommandPalette>[0]> = {}) {
  const props: Parameters<typeof CommandPalette>[0] = {
    open: true, onOpenChange: vi.fn(), commandItems: items(),
    query: "", onQueryChange: vi.fn(),
    workspaceRoot: "/repo", workspace: { kind: "local" },
    onOpenContentHit: vi.fn(), insertCommand: vi.fn(),
    inputSlot: null, anchor: null, files, fileIcons, historyProvider,
    shortcuts, theme, ...overrides,
  };
  function ControlledPalette() {
    const [query, setQuery] = useState(props.query);
    return (
      <CommandPalette
        {...props}
        query={query}
        onQueryChange={(next) => {
          props.onQueryChange(next);
          setQuery(next);
        }}
      />
    );
  }
  render(<ControlledPalette />);
  return props;
}
const input = () => document.querySelector("[cmdk-input]") as HTMLInputElement;

describe("CommandPalette", () => {
  it("renders nothing while closed", () => {
    setup({ open: false });
    expect(input()).toBeNull();
  });
  it("lists commands with the default placeholder", () => {
    setup();
    expect(input().placeholder).toBe(
      "Type a command, > for history, # to find in files",
    );
    expect(screen.getByText("General")).toBeDefined();
    expect(screen.getByText("Tabs")).toBeDefined();
    expect(screen.getByText("Open settings")).toBeDefined();
    expect(screen.queryByText("Configure the application.")).toBeNull();
  });
  it("filters commands by fuzzy query", () => {
    setup();
    fireEvent.change(input(), { target: { value: "settings" } });
    expect(screen.getByText("Open settings")).toBeDefined();
    expect(screen.queryByText("New terminal")).toBeNull();
  });
  it("runs a command after closing the dialog", async () => {
    const props = setup();
    fireEvent.click(screen.getByText("Open settings").closest("[cmdk-item]") as HTMLElement);
    expect(props.onOpenChange).toHaveBeenCalledWith(false);
    await waitFor(() => expect(props.commandItems[0].run).toHaveBeenCalled());
  });
  it("shows the help view for ?", () => {
    setup();
    fireEvent.change(input(), { target: { value: "?" } });
    expect(screen.getByText("Search modes")).toBeDefined();
    expect(screen.getByText("Search command history")).toBeDefined();
  });
  it("enters history mode via > and runs a history command", async () => {
    historyList.mockResolvedValue(["git status"]);
    const props = setup();
    fireEvent.change(input(), { target: { value: ">" } });
    expect(input().placeholder).toBe("Search command history...");
    fireEvent.click((await screen.findByText("git status")).closest("[cmdk-item]") as HTMLElement);
    await waitFor(() => expect(props.insertCommand).toHaveBeenCalledWith("git status"));
  });
  it("enters content mode via # and opens a hit", async () => {
    grepInteractive.mockResolvedValue({ hits: [{ path: "/repo/a.ts", rel: "a.ts", line: 4, text: "hello" }] });
    const props = setup();
    fireEvent.change(input(), { target: { value: "#hello" } });
    expect(input().placeholder).toBe("Find text in files...");
    fireEvent.click((await screen.findByText("hello")).closest("[cmdk-item]") as HTMLElement);
    await waitFor(() => expect(props.onOpenContentHit).toHaveBeenCalledWith("/repo/a.ts", 4));
  });
  it("opens the themes page from the theme command", () => {
    setup();
    fireEvent.click(screen.getByText("Change theme...").closest("[cmdk-item]") as HTMLElement);
    expect(input().placeholder).toBe("Search themes...");
    expect(screen.getByText("Nord")).toBeDefined();
    expect(screen.getByText("Dracula")).toBeDefined();
    expect(screen.getByText("My Custom")).toBeDefined();
  });
  it("filters themes and commits a selection", () => {
    const props = setup();
    fireEvent.click(screen.getByText("Change theme...").closest("[cmdk-item]") as HTMLElement);
    fireEvent.change(input(), { target: { value: "drac" } });
    expect(screen.queryByText("Nord")).toBeNull();
    fireEvent.click(screen.getByText("Dracula").closest("[cmdk-item]") as HTMLElement);
    expect(mutate).toHaveBeenCalledWith({ type: "set-theme", id: "dracula" });
    expect(props.onOpenChange).toHaveBeenCalledWith(false);
  });
  it("previews a highlighted theme after the hover delay", async () => {
    setup();
    fireEvent.click(screen.getByText("Change theme...").closest("[cmdk-item]") as HTMLElement);
    fireEvent.keyDown(input(), { key: "ArrowDown" });
    fireEvent.keyDown(input(), { key: "ArrowDown" });
    await waitFor(() =>
      expect(mutate).toHaveBeenCalledWith({ type: "preview-theme", id: "nord" }),
    );
  });
  it("leaves the themes page with backspace on an empty query", () => {
    setup();
    fireEvent.click(screen.getByText("Change theme...").closest("[cmdk-item]") as HTMLElement);
    fireEvent.keyDown(input(), { key: "Backspace" });
    expect(input().placeholder).toBe(
      "Type a command, > for history, # to find in files",
    );
    expect(mutate).toHaveBeenCalledWith({ type: "preview-theme", id: null });
  });
  it("clears the theme preview when the dialog closes", () => {
    const props = setup();
    fireEvent.keyDown(input(), { key: "Escape" });
    expect(props.onOpenChange).toHaveBeenCalledWith(false);
    expect(mutate).toHaveBeenCalledWith({ type: "preview-theme", id: null });
  });
  it("starts in content mode when requested", () => {
    setup({ initialMode: "content", query: "#" });
    expect(input().value).toBe("#");
    expect(input().placeholder).toBe("Find text in files...");
  });
});
