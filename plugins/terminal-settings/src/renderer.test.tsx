// @vitest-environment jsdom
import type { PreferencesCapability } from "@termco/storage-base";
import type { PtyCapability } from "@termco/terminal-base";
import type { WorkspaceCapability } from "@termco/workspace-base";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TERMINAL_DEFAULTS } from "./model";
import { createTerminalSettings } from "./renderer";

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
const pty = {
  listShells: vi.fn(() => [
    { name: "zsh", path: "/bin/zsh", integrated: true },
    { name: "fish", path: "/opt/fish", integrated: false },
  ]),
} as unknown as PtyCapability;
const workspace = {
  listWslDistros: vi.fn(() => [{ name: "Ubuntu" }]),
} as unknown as WorkspaceCapability;

class ResizeObserverStub { observe() {} unobserve() {} disconnect() {} }

beforeEach(() => {
  vi.stubGlobal("ResizeObserver", ResizeObserverStub);
  values = { ...TERMINAL_DEFAULTS };
  listeners.clear();
  vi.clearAllMocks();
});
afterEach(cleanup);

describe("exact Terminal settings section", () => {
  it("restores the original grouped cards, controls, and explanations", async () => {
    const Section = createTerminalSettings(preferences, pty, workspace);
    const { container } = render(<Section />);
    await screen.findByText("Rendering");
    expect(screen.getByText("Shell")).toBeDefined();
    expect(screen.getByText(/lower idle CPU/)).toBeDefined();
    expect(screen.getByText(/~3 KB \/ line/)).toBeDefined();
    expect(screen.getByText(/terminal and AI agent alike/)).toBeDefined();
    expect(container.querySelectorAll(".rounded-lg.border")).toHaveLength(2);
    expect(screen.getAllByRole("combobox")).toHaveLength(6);
    expect(screen.queryByRole("switch", { name: "Cursor blinking" })).toBeNull();
    expect(screen.getAllByRole("combobox")[0].textContent).toContain("Normal");
  });

  it("persists switches and font-family commits", async () => {
    const Section = createTerminalSettings(preferences, pty, workspace);
    render(<Section />);
    fireEvent.click((await screen.findAllByRole("switch"))[0]);
    expect(preferences.set).toHaveBeenCalledWith("terminalCursorBlink", true);
    const font = screen.getByRole("textbox");
    fireEvent.change(font, { target: { value: "  CaskaydiaCove Nerd Font Mono  " } });
    fireEvent.blur(font);
    expect(preferences.set).toHaveBeenCalledWith("terminalFontFamily", "CaskaydiaCove Nerd Font Mono");
  });

  it("reacts to provider changes", async () => {
    const Section = createTerminalSettings(preferences, pty, workspace);
    render(<Section />);
    const toggle = (await screen.findAllByRole("switch"))[1];
    act(() => {
      values.reconnectSshOnStartup = false;
      for (const listener of listeners) listener("reconnectSshOnStartup", false);
    });
    await waitFor(() => expect(toggle.getAttribute("data-state")).toBe("unchecked"));
  });
});
