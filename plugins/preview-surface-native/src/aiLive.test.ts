import { describe, expect, it, vi } from "vitest";
import type { AiLiveCapability, AiLiveContributionCapability } from "@termco/ai-live-base";
import type { BrowserTabsCapability } from "@termco/browser-base";
import { contributeBrowserAiLive } from "./aiLive";

describe("browser AI live contribution", () => {
  it("routes every browser operation through the shared tabs provider", () => {
    const captured: { value?: Partial<AiLiveCapability> } = {};
    const dispose = vi.fn();
    const tabs = {
      open: vi.fn(() => 5),
      active: vi.fn(() => 5),
      list: vi.fn(() => [{ id: 5, url: "https://example.com", title: "Example" }]),
      select: vi.fn(() => true),
      close: vi.fn(() => true),
    } as unknown as BrowserTabsCapability;

    const returned = contributeBrowserAiLive(
      {
        contribute(value: Partial<AiLiveCapability>) {
          captured.value = value;
          return dispose;
        },
      } as AiLiveContributionCapability,
      tabs,
    );

    expect(captured.value?.openPreview?.("https://example.com")).toBe(true);
    expect(captured.value?.getBrowserTabId?.("remote")).toBe(5);
    expect(captured.value?.listBrowserTabs?.("remote")).toHaveLength(1);
    expect(captured.value?.switchBrowserTab?.(5)).toBe(true);
    expect(captured.value?.closeBrowserTab?.(5)).toBe(true);
    expect(tabs.open).toHaveBeenCalledWith("https://example.com");
    returned();
    expect(dispose).toHaveBeenCalledOnce();
  });
});
