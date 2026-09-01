/**
 * Per-view Chrome DevTools Protocol session, via Electron's built-in
 * `webContents.debugger`. This is the trusted, Chromium-native path the AI
 * uses to read (accessibility tree) and act (hit-tested `Input.dispatch*`) on
 * an embedded page — the same machinery Playwright drives.
 *
 * Single-client caveat: only one CDP client may attach to a webContents. If
 * the user has DevTools open, `attach()` throws; callers must fall back to the
 * isolated-world path (`snapshotScript.ts`) so the feature degrades instead of
 * breaking. On detach (DevTools opened later, crash, target gone) the session
 * is dropped and re-attached lazily on the next command.
 */
import type { WebContents } from "electron";
import { handleCdpEvent } from "./observe";

interface Session {
  usable: boolean;
}

const sessions = new WeakMap<WebContents, Session>();
/** webContents whose `detach`/`destroyed` listeners are already bound. */
const bound = new WeakSet<WebContents>();

/** Fire a CDP command. Rejects if the session isn't attached. */
export function send<T = unknown>(
  wc: WebContents,
  method: string,
  params?: Record<string, unknown>,
): Promise<T> {
  return wc.debugger.sendCommand(method, params ?? {}) as Promise<T>;
}

/**
 * Ensure a usable CDP session, enabling the domains the AI layer needs.
 * Returns false when CDP is unavailable (DevTools open, attach/enable failed)
 * so the caller uses the isolated-world fallback. Idempotent and cheap once
 * attached.
 */
export async function ensureCdp(wc: WebContents): Promise<boolean> {
  if (wc.isDestroyed()) return false;

  const cached = sessions.get(wc);
  if (cached?.usable && wc.debugger.isAttached()) return true;

  try {
    if (!wc.debugger.isAttached()) wc.debugger.attach("1.3");
  } catch {
    // Almost always: DevTools is open on this view. Degrade gracefully.
    sessions.set(wc, { usable: false });
    return false;
  }

  // Wire listeners BEFORE enabling domains so no console/network events between
  // enable and listener-binding are missed.
  if (!bound.has(wc)) {
    bound.add(wc);
    wc.debugger.on("message", (_event, method, params) => {
      handleCdpEvent(wc, method, (params ?? {}) as Record<string, unknown>);
    });
    wc.debugger.on("detach", () => sessions.delete(wc));
    wc.once("destroyed", () => {
      sessions.delete(wc);
    });
  }

  try {
    // Capture domains first, so buffering starts as early as possible.
    await send(wc, "Runtime.enable");
    await send(wc, "Network.enable").catch(() => {});
    await send(wc, "Log.enable").catch(() => {});
    // Then the domains the AI action/read layer needs.
    await send(wc, "DOM.enable");
    await send(wc, "Accessibility.enable");
    await send(wc, "Page.enable");
  } catch {
    try {
      wc.debugger.detach();
    } catch {
      /* already gone */
    }
    sessions.set(wc, { usable: false });
    return false;
  }

  sessions.set(wc, { usable: true });
  return true;
}

/** True when a usable CDP session currently exists (no attach attempt). */
export function cdpUsable(wc: WebContents): boolean {
  return (
    !wc.isDestroyed() &&
    (sessions.get(wc)?.usable ?? false) &&
    wc.debugger.isAttached()
  );
}

/** Detach the CDP session for a view being torn down. */
export function detachCdp(wc: WebContents): void {
  sessions.delete(wc);
  try {
    if (!wc.isDestroyed() && wc.debugger.isAttached()) wc.debugger.detach();
  } catch {
    /* already detached / destroyed */
  }
}
