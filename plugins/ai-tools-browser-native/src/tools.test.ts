import type { AiToolRuntime } from "@termco/ai-tools-base";
import type { BrowserAutomationCapability } from "@termco/browser-base";
import { describe, expect, it, vi } from "vitest";
import {
  BrowserToolSet,
  isLoopbackHost,
  originNeedsApproval,
  safeOrigin,
} from "./tools";

function provider(
  handler: (command: string, payload: Record<string, unknown>) => unknown =
    (command) => command === "browser_ai_status"
      ? { url: "https://example.com/page", title: "Example", loading: false }
      : { ok: true },
): BrowserAutomationCapability {
  return {
    commands: () => [],
    invoke: vi.fn(async (command, payload) => handler(command, payload)),
    liveResources: () => [],
  };
}

function runtime(overrides: Partial<AiToolRuntime> = {}): AiToolRuntime {
  return {
    getSessionId: () => "session-1",
    getBrowserTabId: () => 5,
    openBrowser: () => 9,
    listBrowserTabs: () => [],
    switchBrowserTab: () => false,
    closeBrowserTab: () => false,
    modelSupportsVision: () => true,
    ...overrides,
  };
}

describe("browser origin policy", () => {
  it("recognizes loopback and safely parses origins", () => {
    expect(isLoopbackHost("localhost")).toBe(true);
    expect(isLoopbackHost("app.localhost")).toBe(true);
    expect(isLoopbackHost("example.com")).toBe(false);
    expect(safeOrigin("https://example.com/path")).toBe("https://example.com");
    expect(safeOrigin("not a url")).toBeNull();
  });

  it("requires approval externally and skips it for loopback", () => {
    expect(originNeedsApproval("new-session", "https://example.com")).toBe(true);
    expect(originNeedsApproval("new-session", "http://localhost:5173")).toBe(false);
  });

  it("allows the current origin for only the selected session", async () => {
    const set = new BrowserToolSet(provider());
    await expect(set.policy().allowCurrentOrigin("allowed-session", 5))
      .resolves.toBe("https://example.com");
    expect(originNeedsApproval("allowed-session", "https://example.com")).toBe(false);
    expect(originNeedsApproval("other-session", "https://example.com")).toBe(true);
  });
});

describe("AI Tools: Browser", () => {
  it("publishes the browser tool group", () => {
    expect(new BrowserToolSet(provider()).contribution()).toMatchObject({
      id: "browser",
      group: "browser",
      order: 190,
    });
  });

  it("drives the selected shared provider and formats page snapshots", async () => {
    const browser = provider((command) => command === "browser_ai_snapshot" ? {
      title: "Docs",
      url: "https://example.com/docs",
      docH: 2000,
      viewportH: 800,
      scrollY: 100,
      text: 'button "Save" [ref=s1e1]',
      truncated: false,
    } : { ok: true });
    const result = await new BrowserToolSet(browser).tools(runtime())
      .browser_read_page.execute({ filter: "viewport" }) as { page: string };
    expect(result.page).toContain("Page: Docs");
    expect(result.page).toContain("showing 100–900 of 2000px");
    expect(result.page).toContain("[ref=s1e1]");
    expect(browser.invoke).toHaveBeenCalledWith(
      "browser_ai_snapshot",
      { tabId: 5, filter: "viewport" },
    );
  });

  it("opens a shared tab when navigating without an existing browser", async () => {
    const openBrowser = vi.fn(() => 42);
    const browser = provider();
    const result = await new BrowserToolSet(browser).tools(runtime({
      getBrowserTabId: () => null,
      openBrowser,
    })).browser_navigate.execute({ url: "https://example.com" });
    expect(openBrowser).toHaveBeenCalledWith("https://example.com");
    expect(result).toMatchObject({ ok: true, url: "https://example.com/page" });
  });

  it("waits for a newly opened tab's native browser view before reporting success", async () => {
    let statusChecks = 0;
    const openBrowser = vi.fn(() => 42);
    const browser = provider((command) => {
      if (command !== "browser_ai_status") return { ok: true };
      statusChecks += 1;
      return statusChecks === 1
        ? { error: "no browser tab open" }
        : statusChecks === 2
          ? { url: "", title: "", loading: false }
          : { url: "https://example.com/ready", title: "Ready", loading: true };
    });
    const result = await new BrowserToolSet(browser).tools(runtime({
      getBrowserTabId: () => null,
      openBrowser,
    })).browser_navigate.execute({ url: "https://example.com/ready" });

    expect(openBrowser).toHaveBeenCalledOnce();
    expect(statusChecks).toBe(3);
    expect(result).toEqual({
      ok: true,
      tabId: 42,
      url: "https://example.com/ready",
      title: "Ready",
      loading: true,
    });
  });

  it("waits for browser_open_tab and removes a newly created tab that never becomes ready", async () => {
    vi.useFakeTimers();
    try {
      const closeBrowserTab = vi.fn(() => true);
      const browser = provider((command) => command === "browser_ai_status"
        ? { error: "no browser tab open" }
        : { ok: true });
      const resultPromise = new BrowserToolSet(browser).tools(runtime({
        getBrowserTabId: () => null,
        openBrowser: () => 77,
        closeBrowserTab,
      })).browser_open_tab.execute({ url: "https://example.com" });
      await vi.runAllTimersAsync();
      const result = await resultPromise;

      expect(closeBrowserTab).toHaveBeenCalledWith(77);
      expect(result).toEqual({
        error: "browser tab did not become ready",
        tabId: 77,
        url: "https://example.com",
      });
    } finally {
      vi.useRealTimers();
    }
  });

  it("dynamically gates actions on the current origin", async () => {
    const external = new BrowserToolSet(provider()).tools(runtime({
      getSessionId: () => "external-action-session",
    }));
    const approval = external.browser_click.needsApproval as (input: unknown) => Promise<boolean>;
    await expect(approval({ ref: "s1e1" })).resolves.toBe(true);

    const local = new BrowserToolSet(provider((command) =>
      command === "browser_ai_status"
        ? { url: "http://localhost:3000", title: "Dev" }
        : { ok: true },
    )).tools(runtime());
    const localApproval = local.browser_click.needsApproval as (input: unknown) => Promise<boolean>;
    await expect(localApproval({ ref: "s1e1" })).resolves.toBe(false);
  });

  it("always gates password fields and uploads", async () => {
    const tools = new BrowserToolSet(provider((command) => {
      if (command === "browser_ai_field_info") return { isPassword: true };
      if (command === "browser_ai_status") return { url: "http://localhost:3000" };
      return { ok: true };
    })).tools(runtime());
    const typeApproval = tools.browser_type.needsApproval as (input: unknown) => Promise<boolean>;
    await expect(typeApproval({ ref: "password" })).resolves.toBe(true);
    const uploadApproval = tools.browser_file_upload.needsApproval as () => Promise<boolean>;
    await expect(uploadApproval()).resolves.toBe(true);
  });

  it("preserves screenshot image output for model and MCP consumers", async () => {
    const tools = new BrowserToolSet(provider((command) =>
      command === "browser_ai_screenshot"
        ? { ok: true, url: "https://example.com", png: "AAAA", mediaType: "image/jpeg" }
        : { ok: true },
    )).tools(runtime());
    const output = await tools.browser_screenshot.execute({});
    expect(output).toMatchObject({ png: "AAAA", mediaType: "image/jpeg" });
    expect(tools.browser_screenshot.toModelOutput?.({ output })).toEqual({
      type: "content",
      value: [
        { type: "text", text: "Screenshot of https://example.com" },
        { type: "image-data", data: "AAAA", mediaType: "image/jpeg" },
      ],
    });
  });

  it("uses the session runtime for tab list, switch, and close", async () => {
    const switchBrowserTab = vi.fn(() => true);
    const closeBrowserTab = vi.fn(() => true);
    const tools = new BrowserToolSet(provider()).tools(runtime({
      listBrowserTabs: () => [{ id: 3, url: "https://x", title: "X" }],
      switchBrowserTab,
      closeBrowserTab,
    }));
    expect(await tools.browser_list_tabs.execute({})).toEqual({
      tabs: [{ id: 3, url: "https://x", title: "X" }],
    });
    expect(await tools.browser_switch_tab.execute({ tabId: 3 })).toEqual({ ok: true });
    expect(await tools.browser_close_tab.execute({ tabId: 3 })).toEqual({ ok: true });
  });
});
