/**
 * Shell-integration OSC parsing state and helpers: OSC 7 (cwd
 * reporting) and OSC 133 (prompt / command lifecycle markers) cooperate
 * through a shared `ShellIntegrationState` so cwd updates emitted by
 * untrusted command output are ignored — only cwd reported by the
 * local shell between commands is honored. Registration lives in
 * streamHandlers.ts (the PtyStreamParser variants).
 */

import { IS_WINDOWS } from "../../../platform";

/**
 * Cross-handler state shared between the OSC 7 cwd handler and the OSC 133
 * prompt-marker handler. Tracks whether we are currently inside a running
 * command (between OSC 133 B and the next OSC 133 D / A), so the cwd handler
 * can ignore OSC 7 updates emitted by *command output* (e.g. a remote SSH
 * server, a `cat` of an attacker-controlled file). Only OSC 7 issued by the
 * local shell — which fires between commands — should be honored.
 */
export type ShellIntegrationState = {
  inCommand: boolean;
};

export function createShellIntegrationState(): ShellIntegrationState {
  return { inCommand: false };
}

export function parseOsc7(data: string): string | null {
  const m = data.match(/^file:\/\/[^/]*(\/.*)$/);
  if (!m) return null;
  let path = m[1];
  try {
    path = decodeURIComponent(path);
  } catch {}
  // /C:/Users/foo -> C:/Users/foo so it's a valid Windows path.
  if (/^\/[A-Za-z]:/.test(path)) {
    path = path.slice(1);
  } else if (IS_WINDOWS) {
    // git-bash (MSYS) reports cwd as /c/Users/foo; map it to C:/Users/foo.
    const drive = path.match(/^\/([A-Za-z])(\/.*)?$/);
    if (drive) path = `${drive[1].toUpperCase()}:${drive[2] ?? "/"}`;
  }
  return path;
}
