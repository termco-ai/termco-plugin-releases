/**
 * The shared persistent session every embedded-browser view runs in. One
 * partition for all browser tabs (Chrome-like shared logins, persisted across
 * restarts). Configured lazily, before the first view is created, so the UA
 * and permission policy apply from the first request. The packaged-app CSP in
 * index.ts only touches `defaultSession`, so this partition is unaffected.
 */
import { app, session, type Session } from "electron";
import { sanitizeUserAgent } from "./pure";

export const BROWSER_PARTITION = "persist:browser";

/** Permissions an arbitrary embedded page may use without asking. */
const ALLOWED_PERMISSIONS = new Set([
  "fullscreen",
  "pointerLock",
  "clipboard-sanitized-write",
]);

let configured: Session | null = null;

export function browserSession(): Session {
  if (configured) return configured;
  const ses = session.fromPartition(BROWSER_PARTITION);
  ses.setUserAgent(sanitizeUserAgent(ses.getUserAgent(), app.getName()));
  ses.setPermissionRequestHandler((_wc, permission, callback) => {
    callback(ALLOWED_PERMISSIONS.has(permission));
  });
  configured = ses;
  return ses;
}
