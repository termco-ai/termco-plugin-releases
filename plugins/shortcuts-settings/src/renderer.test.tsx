// @vitest-environment jsdom
import type { ShortcutRegistryCapability, ShortcutRegistrySnapshot } from "@termco/shortcuts-base";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createShortcutSettings } from "./renderer";

let snapshot: ShortcutRegistrySnapshot;
const listeners = new Set<() => void>();
const registry = {
  snapshot: () => snapshot,
  subscribe(listener: () => void) {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
  format: () => ["⌘", "T"],
  setBindings: vi.fn(async () => {}),
  reset: vi.fn(async () => {}),
  resetAll: vi.fn(async () => {}),
} as unknown as ShortcutRegistryCapability;

beforeEach(() => {
  snapshot = {
    revision: 1,
    shortcuts: [
      { id: "tab.new", label: "New tab", description: "Open a new workspace tab.", group: "Tabs", defaultBindings: [{ key: "t", meta: true }] },
      { id: "file.save", label: "Save file", description: "Save the active editor.", group: "Editor", defaultBindings: [{ key: "s", meta: true }] },
    ],
    groups: ["Tabs", "Editor"],
    overrides: {},
  };
  listeners.clear();
  vi.clearAllMocks();
});
afterEach(cleanup);

describe("exact Shortcuts settings section", () => {
  it("restores search, grouped cards, keycaps, and explanations", () => {
    const Section = createShortcutSettings(registry);
    const { container } = render(<Section />);
    expect(screen.getByRole("textbox", { name: "Filter shortcuts" })).toBeDefined();
    expect(screen.getByText("Tabs")).toBeDefined();
    expect(screen.getByText("Open a new workspace tab.")).toBeDefined();
    expect(screen.getAllByText("⌘")).toHaveLength(2);
    expect(screen.queryByRole("button", { name: /Record New tab/ })).toBeNull();
    expect(container.querySelectorAll(".rounded-lg.border")).toHaveLength(2);
  });

  it("filters and records through the shared shortcut provider", async () => {
    const Section = createShortcutSettings(registry);
    const { container } = render(<Section />);
    fireEvent.change(screen.getByRole("textbox", { name: "Filter shortcuts" }), { target: { value: "save" } });
    expect(screen.queryByText("New tab")).toBeNull();
    fireEvent.click(container.querySelector('[data-shortcut-trigger="file.save"]')!);
    expect(screen.getByText("Recording...")).toBeDefined();
    fireEvent.keyDown(window, { key: "k", ctrlKey: true });
    await waitFor(() => expect(registry.setBindings).toHaveBeenCalledWith("file.save", [{ key: "k", ctrl: true, shift: false, alt: false, meta: false }]));
  });

  it("uses the original reset confirmation dialog", async () => {
    const Section = createShortcutSettings(registry);
    render(<Section />);
    fireEvent.click(screen.getByRole("button", { name: /Restore defaults/ }));
    expect(await screen.findByText("Reset all shortcuts?")).toBeDefined();
    fireEvent.click(screen.getByRole("button", { name: "Reset All" }));
    await waitFor(() => expect(registry.resetAll).toHaveBeenCalled());
  });
});
