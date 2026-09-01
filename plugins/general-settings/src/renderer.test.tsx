// @vitest-environment jsdom
import type { DesktopIntegrationCapability } from "@termco/desktop-base";
import type { PreferencesCapability } from "@termco/storage-base";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GENERAL_DEFAULTS } from "./model";
import { createGeneralSettings } from "./renderer";

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
const desktop = {
  autostartEnabled: vi.fn(() => false),
  setAutostart: vi.fn(),
} as unknown as DesktopIntegrationCapability;

class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}

function publish(key: string, value: unknown) {
  act(() => {
    values[key] = value;
    for (const listener of listeners) listener(key, value);
  });
}

beforeEach(() => {
  vi.stubGlobal("ResizeObserver", ResizeObserverStub);
  values = { ...GENERAL_DEFAULTS };
  listeners.clear();
  vi.clearAllMocks();
  vi.mocked(desktop.autostartEnabled).mockReturnValue(false);
});

afterEach(cleanup);

describe("exact General settings section", () => {
  it("restores the grouped card layout and complete explanations", async () => {
    const Section = createGeneralSettings(preferences, desktop);
    const { container } = render(<Section />);
    await screen.findByText("Startup");
    for (const label of ["Startup", "Files", "Agents", "Interface"]) {
      expect(screen.getByText(label)).toBeDefined();
    }
    expect(
      screen.getByText(/Catastrophic shell commands/),
    ).toBeDefined();
    expect(screen.getByText(/cost no tokens/)).toBeDefined();
    expect(container.querySelector('[data-testid="general-settings-section"]')).toBeDefined();
    expect(container.querySelectorAll(".rounded-lg.border")).toHaveLength(4);
    expect(screen.queryByRole("switch", { name: "Launch at login" })).toBeNull();
  });

  it("persists switches and routes autostart through desktop integration", async () => {
    const Section = createGeneralSettings(preferences, desktop);
    render(<Section />);
    const switches = await screen.findAllByRole("switch");
    const launch = switches[0];
    fireEvent.click(launch);
    expect(desktop.setAutostart).toHaveBeenCalledWith(true);
    await waitFor(() =>
      expect(preferences.set).toHaveBeenCalledWith("autostart", true),
    );

    fireEvent.click(switches[2]);
    expect(preferences.set).toHaveBeenCalledWith("showHidden", true);
  });

  it("reacts to provider changes instead of keeping a private snapshot", async () => {
    const Section = createGeneralSettings(preferences, desktop);
    render(<Section />);
    const toggle = (await screen.findAllByRole("switch"))[6];
    expect(toggle.getAttribute("data-state")).toBe("checked");
    publish("richChatUi", false);
    expect(toggle.getAttribute("data-state")).toBe("unchecked");
  });

  it("preserves the exact zoom range and percentage", async () => {
    values.zoomLevel = 1.25;
    const Section = createGeneralSettings(preferences, desktop);
    render(<Section />);
    expect(await screen.findByText("125%")).toBeDefined();
    const slider = screen.getByRole("slider");
    expect(slider.getAttribute("aria-valuemin")).toBe("0.5");
    expect(slider.getAttribute("aria-valuemax")).toBe("2");
    expect(slider.getAttribute("aria-valuenow")).toBe("1.25");
  });
});
