export * from "./browser";

export const BROWSER_AUTOMATION_SERVICE = "browser.automation" as const;
export const BROWSER_TABS_SERVICE = "browser.tabs" as const;

declare module "@termco/kernel" {
  interface Services {
    [BROWSER_AUTOMATION_SERVICE]: import("./browser").BrowserAutomationCapability;
    [BROWSER_TABS_SERVICE]: import("./browser").BrowserTabsCapability;
  }
}
