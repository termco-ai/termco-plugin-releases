// @vitest-environment jsdom

import type {
  ShortcutHandlers,
  ShortcutRegistryCapability,
} from "@termco/shortcuts-base";
import type { UiCommandPaletteCapability } from "@termco/ui-overlays-base";
import { renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { useCommandPaletteShortcuts } from "./useCommandPaletteShortcuts";

describe("command palette shortcut ownership", () => {
  it("opens command and content search from the shared shortcut registry", () => {
    let handlers: ShortcutHandlers = {};
    const shortcuts = {
      useHandlers(next: ShortcutHandlers) {
        handlers = next;
      },
    } as unknown as ShortcutRegistryCapability;
    const palette = {
      show: vi.fn(),
    } as unknown as UiCommandPaletteCapability;

    renderHook(() => useCommandPaletteShortcuts(palette, shortcuts));
    handlers["commandPalette.open"]?.({} as KeyboardEvent);
    handlers["commandPalette.content"]?.({} as KeyboardEvent);

    expect(palette.show).toHaveBeenNthCalledWith(1, "commands");
    expect(palette.show).toHaveBeenNthCalledWith(2, "content");
  });
});
