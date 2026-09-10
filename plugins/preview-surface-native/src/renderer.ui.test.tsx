// @vitest-environment jsdom
import type { BrowserAutomationCapability } from "@termco/browser-base";
import type { DesktopIntegrationCapability } from "@termco/desktop-base";
import type { ApplicationEventsCapability } from "@termco/events-base";
import type { UiTabDescriptor, UiTabsRuntime } from "@termco/ui-tabs-base";
import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { BrowserClient } from "./browser";
import { createPreviewSurface } from "./renderer";

class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}

beforeEach(() => {
  vi.stubGlobal("ResizeObserver", ResizeObserverStub);
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

function renderPreview(url = "") {
  const tab: UiTabDescriptor = {
    id: 41,
    rigId: "rig-1",
    kind: "preview",
    title: "Preview",
    cold: false,
    url,
  };
  const automation = { invoke: vi.fn(async () => null) } as unknown as BrowserAutomationCapability;
  const events = { subscribe: vi.fn(() => () => {}) } as unknown as ApplicationEventsCapability;
  const desktop = { openUrl: vi.fn() } as unknown as DesktopIntegrationCapability;
  const runtime = {
    allTabs: () => [tab],
    updateTab: vi.fn(),
    subscribeOverlays: () => () => {},
    overlayRects: () => [],
    hasUnpositionedOverlay: () => false,
    canAttachImageToAi: () => false,
  } as unknown as UiTabsRuntime;
  const Surface = createPreviewSurface(new BrowserClient(automation, events), desktop);
  const rendered = render(<Surface tabs={[tab]} activeId={tab.id} surfaceVisible runtime={runtime} />);
  return { ...rendered, desktop, automation, setVisible: (surfaceVisible: boolean) =>
    rendered.rerender(<Surface tabs={[tab]} activeId={tab.id} surfaceVisible={surfaceVisible} runtime={runtime} />) };
}

describe("exact Web Preview surface", () => {
  it("restores the established toolbar labels and empty-state guidance", () => {
    const { container } = renderPreview();

    expect(screen.getByTitle("Reload")).toBeDefined();
    expect(screen.getByTitle("Common dev-server ports").textContent).toContain("Ports");
    expect(screen.getByTitle("Console & Network")).toBeDefined();
    for (const title of [
      "Back",
      "Forward",
      "Pick an element and send it to the AI",
      "Open in system browser",
    ]) {
      const control = screen.getByTitle(title) as HTMLButtonElement;
      expect(control.disabled).toBe(true);
      expect(control.className).toContain("disabled:pointer-events-none");
    }
    expect(screen.getByPlaceholderText("http://localhost:3000")).toBeDefined();
    expect(screen.getByText("Nothing to preview yet")).toBeDefined();
    expect(container.textContent).toContain("dropdown to jump straight to your running dev server");
    expect(container.textContent).toContain("Public sites often block embedding");
  });

  it("keeps navigation, AI picker, and system-browser actions once a URL is active", () => {
    renderPreview("http://localhost:3000");
    expect(screen.getByTitle("Back")).toBeDefined();
    expect(screen.getByTitle("Forward")).toBeDefined();
    expect(screen.getByTitle("Pick an element and send it to the AI")).toBeDefined();
    expect(screen.getByTitle("Open in system browser")).toBeDefined();
  });

  it("tracks position-only moves without repeated native calls or polling hidden tabs", () => {
    let nextFrame = 0;
    const frames = new Map<number, FrameRequestCallback>();
    vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
      frames.set(++nextFrame, callback);
      return nextFrame;
    });
    vi.stubGlobal("cancelAnimationFrame", (id: number) => frames.delete(id));
    const tick = () => act(() => {
      const pending = [...frames.values()];
      frames.clear();
      pending.forEach(callback => callback(0));
    });
    let y = 100;
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(() =>
      ({ x: 100, y, left: 100, top: y, right: 400, bottom: y + 200, width: 300, height: 200, toJSON() {} }));
    const { automation, setVisible, unmount } = renderPreview("https://example.test");
    tick();
    const boundsCalls = () => vi.mocked(automation.invoke).mock.calls.filter(([name]) => name === "browser_set_bounds");
    const initialCount = boundsCalls().length;
    for (let frame = 0; frame < 5; frame++) tick();
    expect(boundsCalls()).toHaveLength(initialCount);
    y = 400;
    tick();
    expect(boundsCalls()).toHaveLength(initialCount + 1);
    expect(boundsCalls().at(-1)?.[1]).toMatchObject({ bounds: { x: 100, y: 400, width: 300, height: 200 } });
    setVisible(false);
    tick();
    expect(frames.size).toBe(0);
    setVisible(true);
    tick();
    expect(frames.size).toBe(1);
    unmount();
    expect(frames.size).toBe(0);
  });
});
