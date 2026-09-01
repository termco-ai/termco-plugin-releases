// @vitest-environment jsdom
import type { ApplicationEventsCapability } from "@termco/events-base";
import type { ThemeSnapshot, UiThemeCapability } from "@termco/ui-theme-base";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createAppearanceSettings } from "./renderer";

let snapshot: ThemeSnapshot;
const listeners = new Set<() => void>();
const theme = {
  snapshot: () => snapshot,
  subscribe(listener: () => void) {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
  mutate: vi.fn(async () => ({})),
  validate: vi.fn(),
} as unknown as UiThemeCapability;
const events = {
  emit: vi.fn(),
  subscribe: vi.fn(() => () => {}),
  subscribeAll: vi.fn(() => () => {}),
  listenerCount: vi.fn(() => 0),
} satisfies ApplicationEventsCapability;

class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}

function baseSnapshot(): ThemeSnapshot {
  return {
    revision: 1,
    mode: "system",
    resolvedMode: "dark",
    themeId: "termco-default",
    themes: [
      {
        id: "termco-default",
        name: "Termco Default",
        description: "Built for Termco",
        variants: {
          dark: {
            colors: {
              primary: "#7c9cff",
              foreground: "#f4f4f5",
              muted: "#27272a",
            },
          },
        },
      },
      {
        id: "company-custom",
        name: "Company Custom",
        variants: { dark: { colors: { primary: "#ff0000" } } },
      },
    ],
    customThemeIds: ["company-custom"],
    editorTheme: "auto",
    background: {
      kind: "none",
      imageId: null,
      opacity: 0.8,
      blur: 4,
    },
  };
}

function publish(next: ThemeSnapshot) {
  act(() => {
    snapshot = next;
    for (const listener of listeners) listener();
  });
}

beforeEach(() => {
  vi.stubGlobal("ResizeObserver", ResizeObserverStub);
  snapshot = baseSnapshot();
  listeners.clear();
  vi.clearAllMocks();
});

afterEach(cleanup);

describe("exact Appearance settings section", () => {
  it("restores the original grouped mode, theme, syntax, and background UI", () => {
    const Section = createAppearanceSettings(theme, events);
    const { container } = render(<Section />);
    for (const label of [
      "Interface mode",
      "Color theme",
      "Syntax",
      "Desktop background",
    ]) {
      expect(screen.getByText(label)).toBeDefined();
    }
    expect(screen.getByRole("button", { name: "System" })).toBeDefined();
    expect(screen.getByRole("button", { name: "Light" })).toBeDefined();
    expect(screen.getByRole("button", { name: "Dark" })).toBeDefined();
    expect(screen.getByText("Import .termco-theme")).toBeDefined();
    expect(screen.getByRole("button", { name: /Termco Default.*Built for Termco/ })).toBeDefined();
    expect(screen.getByText("No background set")).toBeDefined();
    expect(container.querySelectorAll(".h-24")).toHaveLength(3);
  });

  it("routes mode, theme, editor, and custom-theme actions through ui.theme", async () => {
    const dismiss = vi.fn();
    const Section = createAppearanceSettings(theme, events);
    render(<Section dismiss={dismiss} />);
    fireEvent.click(screen.getByRole("button", { name: "Dark" }));
    fireEvent.click(screen.getByRole("button", { name: /^Company Custom/ }));
    fireEvent.click(screen.getByRole("button", { name: "Edit Company Custom" }));
    await waitFor(() => {
      expect(theme.mutate).toHaveBeenCalledWith({ type: "set-mode", mode: "dark" });
      expect(theme.mutate).toHaveBeenCalledWith({ type: "set-theme", id: "company-custom" });
      expect(theme.mutate).toHaveBeenCalledWith({
        type: "request-edit",
        request: { action: "edit", id: "company-custom" },
      });
      expect(dismiss).toHaveBeenCalled();
    });
  });

  it("keeps background state reactive and exposes the original controls", async () => {
    const Section = createAppearanceSettings(theme, events);
    render(<Section />);
    publish({
      ...snapshot,
      revision: 2,
      background: {
        kind: "image",
        imageId: "wallpaper",
        opacity: 0.65,
        blur: 12,
      },
    });
    expect(screen.getByText("Background image set")).toBeDefined();
    expect(screen.getByText("65%")).toBeDefined();
    expect(screen.getByText("12px")).toBeDefined();
    fireEvent.click(screen.getByRole("button", { name: "Remove" }));
    await waitFor(() =>
      expect(theme.mutate).toHaveBeenCalledWith({ type: "remove-background" }),
    );
  });
});
