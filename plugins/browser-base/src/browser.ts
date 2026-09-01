export interface BrowserCapabilityCaller {
  senderWebContentsId: number;
  windowId?: number;
  windowLabel?: string;
}

/** Shared embedded-browser view pool and automation runtime. */
export interface BrowserAutomationCapability {
  commands(): readonly string[];
  invoke(
    command: string,
    payload: Record<string, unknown>,
    caller?: BrowserCapabilityCaller,
  ): Promise<unknown>;
  liveResources(): Array<{ id: string; label: string }>;
}

export interface BrowserTabInfo {
  id: number;
  rigId: string;
  url: string;
  title: string;
}

/** Renderer-owned browser tab workflow. The preview plugin implements this;
 * AI/browser consumers use it without knowing the application's tab store. */
export interface BrowserTabsCapability {
  active(rigId?: string): number | null;
  open(url: string, rigId?: string): number;
  list(rigId?: string): BrowserTabInfo[];
  select(id: number): boolean;
  close(id: number): boolean;
}

export const BROWSER_EVENTS = {
  state: "browser:state",
  openUrl: "browser:open-url",
  key: "browser:key",
  console: "browser:console",
  network: "browser:network",
} as const;

export interface BrowserRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface BrowserTabState {
  tabId: number;
  url: string;
  title: string;
  favicon: string | null;
  loading: boolean;
  canGoBack: boolean;
  canGoForward: boolean;
  crashed: string | null;
  loadError: { code: number; description: string; url: string } | null;
}

export interface BrowserOpenUrlEvent {
  tabId: number;
  url: string;
  disposition: string;
}

export interface BrowserKeyEvent {
  tabId: number;
  key: string;
  control: boolean;
  meta: boolean;
  shift: boolean;
  alt: boolean;
}

export interface BrowserChord {
  key: string;
  control?: boolean;
  meta?: boolean;
  shift?: boolean;
  alt?: boolean;
}

export interface BrowserConsoleEntry {
  id: number;
  level: "log" | "info" | "warn" | "error" | "debug";
  text: string;
  ts: number;
  stackTop?: string;
}

export interface BrowserNetworkEntry {
  id: number;
  requestId: string;
  url: string;
  method: string;
  resourceType?: string;
  status?: number;
  mimeType?: string;
  size?: number;
  durationMs?: number;
  failed?: boolean;
  errorText?: string;
  ts: number;
}

export type BrowserPickResult =
  | {
      ok: true;
      url: string;
      title: string;
      png: string;
      text: string;
      tag: string;
      role?: string;
      accessibleName?: string;
    }
  | { cancelled: true }
  | { error: string };
