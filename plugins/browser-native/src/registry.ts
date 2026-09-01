/**
 * Registry of embedded-browser WebContentsViews, keyed by (window label, tab
 * id). Every warm preview tab owns one live view attached to its window's
 * contentView; only the active one is visible, so tab switches never reload.
 * All page events are coalesced into a single `browser:state` event stream the
 * renderer mirrors into its tab state. A crashing or misbehaving page must
 * never take the app down: every handler is scoped to its view, and views are
 * torn down explicitly on tab close, host reload, and window close.
 */
import {
  WebContentsView,
  type BrowserWindow,
  type WebContents,
} from "electron";
import { emitBrowserEvent } from "./events";
import { detachCdp, ensureCdp } from "./cdp";
import { startObserving, stopObserving } from "./observe";
import {
  matchChord,
  normalizeRect,
  viewKey,
  type ChordSpec,
  type Rect,
} from "./pure";
import { BROWSER_PARTITION, browserSession } from "./session";

export interface BrowserViewState {
  tabId: number;
  url: string;
  title: string;
  favicon: string | null;
  loading: boolean;
  canGoBack: boolean;
  canGoForward: boolean;
  /** render-process-gone reason ("crashed", "oom", …) or null when healthy. */
  crashed: string | null;
  loadError: { code: number; description: string; url: string } | null;
}

interface Entry {
  label: string;
  tabId: number;
  win: BrowserWindow;
  view: WebContentsView;
  state: BrowserViewState;
}

const entries = new Map<string, Entry>();

/** Windows whose teardown hooks (closed / host reload) are already attached. */
const hookedWindows = new Set<string>();

/**
 * Chords the renderer wants back while an embedded page has keyboard focus
 * (Cmd+T/W/L, Ctrl+Tab, …). Registered once per renderer boot, global to the
 * app — every view consults the same list.
 */
let interceptChords: ChordSpec[] = [];

export function setInterceptChords(chords: ChordSpec[]): void {
  interceptChords = chords;
}

export function getEntry(label: string, tabId: number): Entry | undefined {
  return entries.get(viewKey(label, tabId));
}

/** The view's webContents for AI control; undefined when the tab has no view. */
export function viewWebContents(label: string, tabId: number) {
  const entry = getEntry(label, tabId);
  if (!entry || entry.view.webContents.isDestroyed()) return undefined;
  return entry.view.webContents;
}

function pushState(entry: Entry, patch?: Partial<BrowserViewState>): void {
  const wc = entry.view.webContents;
  if (!wc.isDestroyed()) {
    entry.state = {
      ...entry.state,
      url: wc.getURL(),
      title: wc.getTitle(),
      loading: wc.isLoading(),
      canGoBack: wc.navigationHistory.canGoBack(),
      canGoForward: wc.navigationHistory.canGoForward(),
      ...patch,
    };
  } else {
    entry.state = { ...entry.state, ...patch };
  }
  emitBrowserEvent(entry.label, "browser:state", entry.state);
}

function wireEvents(entry: Entry): void {
  const wc = entry.view.webContents;

  wc.on("did-start-loading", () =>
    pushState(entry, { loading: true, crashed: null, loadError: null }),
  );
  wc.on("did-stop-loading", () => pushState(entry, { loading: false }));
  wc.on("did-navigate", () => pushState(entry));
  wc.on("did-navigate-in-page", () => pushState(entry));
  wc.on("page-title-updated", () => pushState(entry));
  wc.on("page-favicon-updated", (_e, favicons) =>
    pushState(entry, { favicon: favicons[0] ?? null }),
  );

  wc.on("did-fail-load", (_e, code, description, validatedURL, isMainFrame) => {
    // -3 = ERR_ABORTED: fired for cancelled/stopped loads, not real failures.
    if (!isMainFrame || code === -3) return;
    pushState(entry, {
      loading: false,
      loadError: { code, description, url: validatedURL },
    });
  });

  // Contain page crashes: hide the native view so the renderer's DOM error
  // card is visible, report the reason, and never let it bubble further.
  wc.on("render-process-gone", (_e, details) => {
    entry.view.setVisible(false);
    pushState(entry, { loading: false, crashed: details.reason });
  });

  // A page's beforeunload dialog must never trap tab/app close.
  wc.on("will-prevent-unload", (event) => event.preventDefault());

  // Popups become regular tabs — the renderer decides where they open.
  wc.setWindowOpenHandler(({ url, disposition }) => {
    emitBrowserEvent(entry.label, "browser:open-url", {
      tabId: entry.tabId,
      url,
      disposition,
    });
    return { action: "deny" };
  });

  // Hand app-level chords (Cmd+T, Ctrl+Tab, …) back to the renderer while the
  // page has focus; it re-dispatches them as synthetic KeyboardEvents.
  wc.on("before-input-event", (event, input) => {
    if (!matchChord(input, interceptChords)) return;
    event.preventDefault();
    emitBrowserEvent(entry.label, "browser:key", {
      tabId: entry.tabId,
      key: input.key,
      control: input.control ?? false,
      meta: input.meta ?? false,
      shift: input.shift ?? false,
      alt: input.alt ?? false,
    });
  });
}

/** Attach once-per-window teardown: window closed + host renderer reload. */
function hookWindow(
  win: BrowserWindow,
  renderer: WebContents | undefined,
  label: string,
): void {
  if (hookedWindows.has(label)) return;
  hookedWindows.add(label);
  win.on("closed", () => {
    destroyAllForWindow(label);
    hookedWindows.delete(label);
  });
  // A full host reload (Vite dev reload, prod re-navigation) discards the
  // renderer's view bookkeeping; drop the orphaned views — the renderer
  // re-creates them for warm tabs on boot.
  (renderer ?? win.webContents).on("did-navigate", () =>
    destroyAllForWindow(label),
  );
}

/** Create (idempotently) the view for a tab. Starts hidden; renderer shows it. */
export function createView(
  win: BrowserWindow,
  renderer: WebContents | undefined,
  label: string,
  tabId: number,
  url: string,
  bounds: Rect,
): BrowserViewState {
  const existing = entries.get(viewKey(label, tabId));
  if (existing) {
    existing.view.setBounds(normalizeRect(bounds));
    return existing.state;
  }

  browserSession(); // configure UA/permissions before the partition is used
  const view = new WebContentsView({
    webPreferences: {
      partition: BROWSER_PARTITION,
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  view.setBackgroundColor("#ffffff");

  const entry: Entry = {
    label,
    tabId,
    win,
    view,
    state: {
      tabId,
      url,
      title: "",
      favicon: null,
      loading: Boolean(url),
      canGoBack: false,
      canGoForward: false,
      crashed: null,
      loadError: null,
    },
  };
  entries.set(viewKey(label, tabId), entry);

  hookWindow(win, renderer, label);
  wireEvents(entry);

  win.contentView.addChildView(view);
  view.setBounds(normalizeRect(bounds));
  view.setVisible(false);

  // Capture console/network from the very first byte: register the buffers and
  // enable the CDP domains BEFORE navigating, so first-paint logs/requests
  // aren't missed. The initial load is deferred by the (few ms) CDP setup;
  // subsequent navigations reuse the already-attached session. Best-effort:
  // if attach fails (DevTools open) we load anyway.
  startObserving(view.webContents, label, tabId);
  const wc = view.webContents;
  let loaded = false;
  const load = () => {
    if (loaded) return;
    loaded = true;
    if (url && !wc.isDestroyed()) void wc.loadURL(url).catch(() => {});
  };
  // Load once CDP is ready (so first-paint logs are captured), but never wait
  // more than 400ms — the load must not hinge on the debugger attaching.
  ensureCdp(wc).then(load, load);
  setTimeout(load, 400);

  return entry.state;
}

export function destroyView(label: string, tabId: number): void {
  const key = viewKey(label, tabId);
  const entry = entries.get(key);
  if (!entry) return;
  entries.delete(key);
  try {
    if (!entry.win.isDestroyed()) {
      entry.win.contentView.removeChildView(entry.view);
    }
  } catch {
    // window already tearing down — the view goes with it
  }
  if (!entry.view.webContents.isDestroyed()) {
    // Detach any AI CDP session before closing so it doesn't error mid-teardown.
    stopObserving(entry.view.webContents, label, tabId);
    detachCdp(entry.view.webContents);
    entry.view.webContents.close();
  }
}

export function destroyAllForWindow(label: string): void {
  for (const entry of [...entries.values()]) {
    if (entry.label === label) destroyView(label, entry.tabId);
  }
}

export function destroyAllViews(): void {
  for (const entry of [...entries.values()]) destroyView(entry.label, entry.tabId);
}

export function liveBrowserViews(): Array<{ id: string; label: string }> {
  return [...entries.values()].map((entry) => ({
    id: viewKey(entry.label, entry.tabId),
    label: `${entry.label}: tab ${entry.tabId} (${entry.state.url || "blank"})`,
  }));
}
