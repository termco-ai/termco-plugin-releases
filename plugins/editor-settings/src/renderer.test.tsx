// @vitest-environment jsdom
import type { PreferencesCapability } from "@termco/storage-base";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { EDITOR_DEFAULTS } from "./model";
import { createEditorSettings } from "./renderer";

let values: Record<string, unknown>;
const listeners = new Set<(key: string, value: unknown) => void>();
const preferences = {
  getMany: vi.fn(async (keys: readonly string[]) =>
    Object.fromEntries(keys.map((key) => [key, values[key]])),
  ),
  set: vi.fn(async (key: string, value: unknown) => {
    values[key] = value;
    for (const listener of listeners) listener(key, value);
  }),
  subscribe(listener: (key: string, value: unknown) => void) {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
} as unknown as PreferencesCapability;

beforeEach(() => {
  values = { ...EDITOR_DEFAULTS };
  listeners.clear();
  vi.clearAllMocks();
});
afterEach(cleanup);

describe("exact Editor settings section", () => {
  it("restores the original card, controls, and explanations", async () => {
    const Section = createEditorSettings(preferences);
    const { container } = render(<Section />);
    await screen.findByText("Behavior");
    expect(screen.getByText(/Biome, Prettier, dprint/)).toBeDefined();
    expect(screen.getAllByRole("switch")).toHaveLength(4);
    expect(screen.queryByRole("switch", { name: "Vim mode" })).toBeNull();
    expect(container.querySelectorAll(".rounded-lg.border")).toHaveLength(1);
  });

  it("persists toggles and reveals the exact auto-save delay input", async () => {
    const Section = createEditorSettings(preferences);
    render(<Section />);
    fireEvent.click((await screen.findAllByRole("switch"))[3]);
    expect(await screen.findByRole("spinbutton")).toBeDefined();
    expect(preferences.set).toHaveBeenCalledWith("editorAutoSave", true);
  });

  it("reacts to provider changes", async () => {
    const Section = createEditorSettings(preferences);
    render(<Section />);
    const toggle = (await screen.findAllByRole("switch"))[1];
    act(() => {
      values.editorWordWrap = true;
      for (const listener of listeners) listener("editorWordWrap", true);
    });
    await waitFor(() => expect(toggle.getAttribute("data-state")).toBe("checked"));
  });
});
