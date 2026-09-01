/**
 * Per-view console + network observability, fed by CDP events (routed here from
 * cdp.ts's `message` listener). This is what lets the AI (via browser_ai_*
 * tools) and the user (via the in-app Console/Network panel) actually see what
 * the page is doing — beyond the DOM. Ring-buffered per view; each new entry is
 * also streamed to the renderer for the live panel.
 *
 * The event→entry transforms are pure functions so they can be unit-tested
 * against fixed CDP payloads without an Electron runtime.
 */
import type { WebContents } from "electron";
import { emitBrowserEvent } from "./events";
import { viewKey } from "./pure";

const MAX_ENTRIES = 500;

export type ConsoleLevel = "log" | "info" | "warn" | "error" | "debug";

export interface ConsoleEntry {
  id: number;
  level: ConsoleLevel;
  text: string;
  ts: number;
  /** First stack frame "fn (url:line)" when available. */
  stackTop?: string;
}

export interface NetworkEntry {
  id: number;
  requestId: string;
  url: string;
  method: string;
  resourceType?: string;
  status?: number;
  mimeType?: string;
  /** encoded bytes over the wire. */
  size?: number;
  durationMs?: number;
  failed?: boolean;
  errorText?: string;
  /** CDP monotonic start timestamp (seconds), for duration math. */
  startedAt: number;
  ts: number;
}

interface ViewObs {
  label: string;
  tabId: number;
  console: ConsoleEntry[];
  network: NetworkEntry[];
  netById: Map<string, NetworkEntry>;
  seq: number;
}

const byWc = new WeakMap<WebContents, ViewObs>();
const byKey = new Map<string, WebContents>();

export function startObserving(
  wc: WebContents,
  label: string,
  tabId: number,
): void {
  byWc.set(wc, {
    label,
    tabId,
    console: [],
    network: [],
    netById: new Map(),
    seq: 0,
  });
  byKey.set(viewKey(label, tabId), wc);
}

export function stopObserving(
  wc: WebContents,
  label: string,
  tabId: number,
): void {
  byWc.delete(wc);
  byKey.delete(viewKey(label, tabId));
}

function ring<T>(arr: T[], item: T): void {
  arr.push(item);
  if (arr.length > MAX_ENTRIES) arr.shift();
}

// --- pure transforms (unit-tested) ----------------------------------------

const CONSOLE_LEVEL: Record<string, ConsoleLevel> = {
  log: "log",
  info: "info",
  warning: "warn",
  warn: "warn",
  error: "error",
  debug: "debug",
  assert: "error",
  verbose: "debug",
};

interface RemoteArg {
  value?: unknown;
  description?: string;
  type?: string;
  unserializableValue?: string;
}

function previewArg(arg: RemoteArg): string {
  if (arg == null) return "";
  if ("value" in arg && arg.value !== undefined) {
    return typeof arg.value === "string" ? arg.value : JSON.stringify(arg.value);
  }
  if (arg.unserializableValue) return String(arg.unserializableValue);
  if (arg.description) return arg.description;
  return arg.type ? `[${arg.type}]` : "";
}

/**
 * Render console arguments the way the browser console does: apply
 * `console.log` format specifiers (%s %d %i %f %o %O %j) and, crucially, %c —
 * which consumes a CSS-style argument and contributes NOTHING to the text.
 * Without this, styled logs (very common on real sites, and Electron's own dev
 * warnings) leak the raw `%c` plus the CSS string into the output.
 */
export function formatConsoleArgs(args: RemoteArg[]): string {
  if (args.length === 0) return "";
  const first = args[0];
  const fmt = typeof first?.value === "string" ? first.value : null;
  if (!fmt || !/%[csdifoOj%]/.test(fmt)) {
    return args.map(previewArg).join(" ");
  }
  let i = 1;
  const out = fmt.replace(/%[csdifoOj%]/g, (spec) => {
    if (spec === "%%") return "%";
    if (spec === "%c") {
      i++; // consume the style arg; emit nothing
      return "";
    }
    if (i >= args.length) return spec;
    const v = previewArg(args[i++]);
    if (spec === "%d" || spec === "%i") return String(Number.parseInt(v, 10) || 0);
    if (spec === "%f") return String(Number.parseFloat(v) || 0);
    return v;
  });
  const rest = args
    .slice(i)
    .map(previewArg)
    .join(" ");
  return `${out}${rest ? ` ${rest}` : ""}`.replace(/\s+/g, " ").trim();
}

function stackTop(stackTrace?: {
  callFrames?: Array<{ functionName?: string; url?: string; lineNumber?: number }>;
}): string | undefined {
  const f = stackTrace?.callFrames?.[0];
  if (!f) return undefined;
  const where = f.url ? `${f.url}:${(f.lineNumber ?? 0) + 1}` : "";
  const fn = f.functionName || "(anonymous)";
  return where ? `${fn} (${where})` : fn;
}

/** Build a console entry from a Runtime/Log CDP event, or null if irrelevant. */
export function consoleEntryFrom(
  method: string,
  params: Record<string, unknown>,
  id: number,
  ts: number,
): ConsoleEntry | null {
  if (method === "Runtime.consoleAPICalled") {
    const p = params as {
      type?: string;
      args?: RemoteArg[];
      stackTrace?: unknown;
    };
    const text = formatConsoleArgs(p.args ?? []);
    // Electron injects a dev-only "Insecure Content-Security-Policy" warning
    // into every renderer's console when unpackaged — noise for a browser
    // loading arbitrary sites, and gone in production. Drop it.
    if (text.startsWith("Electron Security Warning")) return null;
    return {
      id,
      level: CONSOLE_LEVEL[p.type ?? "log"] ?? "log",
      text: text.slice(0, 4000),
      ts,
      stackTop: stackTop(p.stackTrace as never),
    };
  }
  if (method === "Runtime.exceptionThrown") {
    const d = (params as { exceptionDetails?: Record<string, unknown> })
      .exceptionDetails;
    const exc = d?.exception as { description?: string } | undefined;
    const text = String(exc?.description ?? d?.text ?? "Uncaught exception");
    return {
      id,
      level: "error",
      text: text.slice(0, 4000),
      ts,
      stackTop: stackTop(d?.stackTrace as never),
    };
  }
  if (method === "Log.entryAdded") {
    const e = (params as { entry?: Record<string, unknown> }).entry;
    if (!e) return null;
    return {
      id,
      level: CONSOLE_LEVEL[String(e.level ?? "log")] ?? "log",
      text: `${e.text ?? ""}${e.url ? ` (${e.url})` : ""}`.slice(0, 4000),
      ts,
    };
  }
  return null;
}

// --- CDP event router ------------------------------------------------------

/** Route a CDP protocol event into the view's buffers + the live panel. */
export function handleCdpEvent(
  wc: WebContents,
  method: string,
  params: Record<string, unknown>,
): void {
  const obs = byWc.get(wc);
  if (!obs) return;
  const now = Date.now();

  const consoleEntry = consoleEntryFrom(method, params, obs.seq + 1, now);
  if (consoleEntry) {
    obs.seq++;
    ring(obs.console, consoleEntry);
    emitBrowserEvent(obs.label, "browser:console", {
      tabId: obs.tabId,
      entry: consoleEntry,
    });
    return;
  }

  // Network events are upserted by requestId. Electron's webContents.debugger
  // doesn't reliably deliver every event of a request's lifecycle (a real
  // cross-process navigation can drop requestWillBeSent), so we create the
  // entry on whichever event arrives first and merge later ones in.
  if (method.startsWith("Network.")) {
    const p = params as {
      requestId?: string;
      request?: { url?: string; method?: string };
      response?: { url?: string; status?: number; mimeType?: string };
      type?: string;
      timestamp?: number;
      encodedDataLength?: number;
      errorText?: string;
      canceled?: boolean;
    };
    if (!p.requestId) return;
    let entry = obs.netById.get(p.requestId);
    if (!entry) {
      entry = {
        id: ++obs.seq,
        requestId: p.requestId,
        url: p.request?.url ?? p.response?.url ?? "",
        method: p.request?.method ?? "GET",
        resourceType: p.type,
        startedAt: p.timestamp ?? 0,
        ts: now,
      };
      obs.netById.set(p.requestId, entry);
      ring(obs.network, entry);
    }
    if (p.request?.url) entry.url = p.request.url;
    if (p.request?.method) entry.method = p.request.method;
    if (p.type) entry.resourceType = p.type;
    if (method === "Network.responseReceived" && p.response) {
      if (p.response.url) entry.url = p.response.url;
      entry.status = p.response.status;
      entry.mimeType = p.response.mimeType;
    }
    if (method === "Network.loadingFinished") {
      entry.size = p.encodedDataLength;
      if (p.timestamp && entry.startedAt) {
        entry.durationMs = Math.max(
          0,
          Math.round((p.timestamp - entry.startedAt) * 1000),
        );
      }
    }
    if (method === "Network.loadingFailed") {
      entry.failed = true;
      entry.errorText = p.canceled ? "canceled" : (p.errorText ?? "failed");
    }
    entry.ts = now;
    emitBrowserEvent(obs.label, "browser:network", { tabId: obs.tabId, entry });
    return;
  }
  if (method === "Page.javascriptDialogOpening") {
    const p = params as {
      type?: string;
      message?: string;
      defaultPrompt?: string;
    };
    // Surface the dialog so the panel/AI knows one occurred. Note: on an
    // embedded WebContentsView, Electron's default dialog manager auto-cancels
    // JS dialogs, so they don't freeze the page — but CDP interception is
    // best-effort and browser_handle_dialog only works while one is still open.
    emitBrowserEvent(obs.label, "browser:dialog", {
      tabId: obs.tabId,
      dialogType: p.type ?? "alert",
      message: p.message ?? "",
      defaultPrompt: p.defaultPrompt,
    });
  }
}

// --- AI getters ------------------------------------------------------------

export interface ConsoleFilter {
  level?: ConsoleLevel;
  limit?: number;
}
export interface NetworkFilter {
  status?: "all" | "error"; // "error": failed or status >= 400
  type?: string;
  urlContains?: string;
  limit?: number;
}

export function getConsole(
  label: string,
  tabId: number,
  filter: ConsoleFilter = {},
): ConsoleEntry[] {
  const wc = byKey.get(viewKey(label, tabId));
  const obs = wc && byWc.get(wc);
  if (!obs) return [];
  let out = obs.console;
  if (filter.level) out = out.filter((e) => e.level === filter.level);
  return out.slice(-(filter.limit ?? 100));
}

export function getNetwork(
  label: string,
  tabId: number,
  filter: NetworkFilter = {},
): NetworkEntry[] {
  const wc = byKey.get(viewKey(label, tabId));
  const obs = wc && byWc.get(wc);
  if (!obs) return [];
  let out = obs.network;
  if (filter.status === "error")
    out = out.filter((e) => e.failed || (e.status ?? 0) >= 400);
  if (filter.type) out = out.filter((e) => e.resourceType === filter.type);
  if (filter.urlContains)
    out = out.filter((e) => e.url.includes(filter.urlContains as string));
  return out.slice(-(filter.limit ?? 100));
}

/** Fetch a response body on demand (CDP; may fail if evicted/navigated away). */
export async function getResponseBody(
  label: string,
  tabId: number,
  requestId: string,
): Promise<{ body: string; base64: boolean } | { error: string }> {
  const wc = byKey.get(viewKey(label, tabId));
  if (!wc || wc.isDestroyed() || !wc.debugger.isAttached()) {
    return { error: "no active browser view" };
  }
  try {
    const res = (await wc.debugger.sendCommand("Network.getResponseBody", {
      requestId,
    })) as { body?: string; base64Encoded?: boolean };
    const body = String(res.body ?? "");
    return {
      body: body.length > 20_000 ? `${body.slice(0, 20_000)}\n…[truncated]` : body,
      base64: Boolean(res.base64Encoded),
    };
  } catch (e) {
    return {
      error: `response body unavailable (${e instanceof Error ? e.message : String(e)})`,
    };
  }
}
