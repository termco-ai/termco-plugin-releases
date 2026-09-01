import type { BrowserTabsCapability } from "@termco/browser-base";
import type { ApplicationEventsCapability } from "@termco/events-base";
import { TERMINAL_BLOCK_EVENTS } from "@termco/terminal-base";
import { describe, expect, it, vi } from "vitest";
import { installTerminalPreviewNavigation } from "./terminalPreviewNavigation";

function setup() {
  let listener: ((payload: unknown) => void) | null = null;
  const dispose = vi.fn();
  const events = {
    subscribe: vi.fn((event: string, next: (payload: unknown) => void) => {
      expect(event).toBe(TERMINAL_BLOCK_EVENTS.openPreview);
      listener = next;
      return dispose;
    }),
  } as unknown as ApplicationEventsCapability;
  const tabs = { open: vi.fn(() => 42) } as unknown as BrowserTabsCapability;
  const unsubscribe = installTerminalPreviewNavigation(events, tabs);
  return { listener: () => listener, tabs, unsubscribe, dispose };
}

describe("terminal block preview navigation", () => {
  it("opens the exact URL through the selected browser tabs provider", () => {
    const result = setup();

    result.listener()?.({ url: "http://localhost:4173/path" });

    expect(result.tabs.open).toHaveBeenCalledWith(
      "http://localhost:4173/path",
    );
  });

  it("ignores malformed preview intents and returns lifecycle cleanup", () => {
    const result = setup();

    result.listener()?.({});
    result.listener()?.({ url: "" });
    result.listener()?.({ url: 42 });

    expect(result.tabs.open).not.toHaveBeenCalled();
    result.unsubscribe();
    expect(result.dispose).toHaveBeenCalledOnce();
  });
});
