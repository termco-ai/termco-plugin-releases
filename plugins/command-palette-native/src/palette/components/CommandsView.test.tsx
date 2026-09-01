// @vitest-environment jsdom
import { Command, CommandList } from "../../ui";
import type { ShortcutRegistryCapability } from "@termco/shortcuts-base";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { PaletteItem } from "../types";
import { CommandsView } from "./CommandsView";

class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}

beforeEach(() => {
  vi.stubGlobal("ResizeObserver", ResizeObserverStub);
  window.HTMLElement.prototype.scrollIntoView = vi.fn();
});

afterEach(cleanup);

const shortcuts: ShortcutRegistryCapability = {
  snapshot: () => ({ revision: 0, groups: [], shortcuts: [], overrides: {} }),
  subscribe: () => () => {},
  bindings: (id) => (id === "tab.new" ? [{ ctrl: true, key: "t" }] : []),
  match: () => false,
  format: (binding) => binding ? [binding.ctrl ? "Ctrl" : "", binding.key.toUpperCase()].filter(Boolean) : [],
  useHandlers: () => {}, setBindings: async () => {}, reset: async () => {}, resetAll: async () => {},
};

function item(overrides: Partial<PaletteItem>): PaletteItem {
  return {
    id: "x",
    title: "X",
    group: "General",
    run: () => {},
    ...overrides,
  };
}

function setup(items: PaletteItem[], onRun = vi.fn()) {
  render(
    <Command>
      <CommandList>
        <CommandsView
          rankedCommands={items}
          shortcuts={shortcuts}
          onRun={onRun}
        />
      </CommandList>
    </Command>,
  );
  return onRun;
}

describe("CommandsView", () => {
  it("shows the empty hint when nothing matches", () => {
    setup([]);
    expect(
      screen.getByText("No commands found. Type ? to see search modes."),
    ).toBeDefined();
  });

  it("buckets commands under their group headings in fixed order", () => {
    setup([
      item({ id: "ai.toggle", title: "Toggle AI agent", group: "AI" }),
      item({ id: "settings.open", title: "Open settings", group: "General" }),
    ]);
    const headings = Array.from(
      document.querySelectorAll("[cmdk-group-heading]"),
    ).map((el) => el.textContent);
    expect(headings).toEqual(["General", "AI"]);
  });

  it("omits groups without matches", () => {
    setup([item({ id: "a", title: "Alpha", group: "Tabs" })]);
    const headings = Array.from(
      document.querySelectorAll("[cmdk-group-heading]"),
    ).map((el) => el.textContent);
    expect(headings).toEqual(["Tabs"]);
  });

  it("labels rows with their resolved shortcut", () => {
    setup([
      item({
        id: "tab.new",
        title: "New terminal",
        group: "Tabs",
        shortcutId: "tab.new",
      }),
    ]);
    // Non-mac fallback: MOD_PROP is ctrl without the native bridge.
    expect(screen.getByText("Ctrl T")).toBeDefined();
  });

  it("runs the clicked command with its item", () => {
    const items = [
      item({ id: "a", title: "Alpha", group: "Tabs" }),
      item({ id: "b", title: "Beta", group: "Tabs" }),
    ];
    const onRun = setup(items);
    fireEvent.click(
      screen.getByText("Beta").closest("[cmdk-item]") as HTMLElement,
    );
    expect(onRun).toHaveBeenCalledWith(items[1]);
  });

  it("renders unknown groups after the known ones, alphabetically", () => {
    setup([
      item({ id: "z", title: "Zulu", group: "Zeta Tools" }),
      item({ id: "a", title: "Alpha", group: "Tabs" }),
      item({ id: "b", title: "Beta", group: "Beta Tools" }),
    ]);
    expect(screen.queryByText("Zulu")).not.toBeNull();
    const headings = Array.from(
      document.querySelectorAll("[cmdk-group-heading]"),
    ).map((el) => el.textContent);
    expect(headings).toEqual(["Tabs", "Beta Tools", "Zeta Tools"]);
  });
});
