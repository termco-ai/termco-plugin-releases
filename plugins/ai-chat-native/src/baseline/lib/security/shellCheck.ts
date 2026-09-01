/**
 * Heuristic guard for obviously destructive shell commands.
 */

import type { SafetyResult } from "./types";

/**
 * Lightweight heuristic for blocking obviously destructive shell commands
 * even after the user has approved them. The approval UI shows the command
 * verbatim, so the user is the primary gate; this just catches a couple of
 * patterns that almost certainly indicate the model went off the rails.
 */
export function checkShellCommand(cmd: string): SafetyResult {
  const c = cmd.trim();
  if (c.length === 0) {
    return { ok: false, reason: "Refused: empty command." };
  }
  // Block C0 controls. CR/LF would let a second statement smuggle past the
  // approval UI, which shows the command as one logical line.
  if (/[\x00-\x1f]/.test(c)) {
    return {
      ok: false,
      reason:
        "Refused: command contains control characters (including CR/LF). Commands must be single-line.",
    };
  }
  // Block Unicode bidi-override and invisible directional marks. These let an
  // attacker craft a command whose visual order (in the approval UI's <pre>
  // block) differs from its logical execution order — a Trojan Source attack.
  // Legitimate shell commands do not need RTL overrides.
  if (/[\u202A-\u202E\u2066-\u2069\u200E\u200F\u061C]/.test(c)) {
    return {
      ok: false,
      reason:
        "Refused: command contains Unicode bidirectional override characters.",
    };
  }
  // rm -rf / (and variants with quoted /, --no-preserve-root, etc.)
  if (
    /\brm\s+(-[a-zA-Z]*r[a-zA-Z]*f[a-zA-Z]*|-[a-zA-Z]*f[a-zA-Z]*r[a-zA-Z]*|--recursive\s+--force|--force\s+--recursive)\s+(['"]?\/['"]?\s*($|;|&|\|))/.test(
      c,
    )
  ) {
    return {
      ok: false,
      reason:
        "Refused: command attempts to recursively delete the filesystem root.",
    };
  }
  // rm -rf ~ / $HOME / ${HOME}, with or without a trailing path — wiping the user's home dir
  if (
    /\brm\s+-[a-zA-Z]*r[a-zA-Z]*f[a-zA-Z]*\s+(['"]?(~(\/[^\s'"]*)?|\$\{?HOME\}?(\/[^\s'"]*)?)['"]?)(\s|$|;|&|\|)/.test(
      c,
    )
  ) {
    return {
      ok: false,
      reason:
        "Refused: command attempts to recursively delete the home directory.",
    };
  }
  if (/--no-preserve-root/.test(c)) {
    return { ok: false, reason: "Refused: --no-preserve-root is not allowed." };
  }
  // dd to a raw disk device
  if (/\bdd\b[^|]*\bof=\/dev\/(disk|sd|nvme|hd)/i.test(c)) {
    return {
      ok: false,
      reason: "Refused: dd to a block device is not allowed.",
    };
  }
  // mkfs / fdisk / diskutil eraseDisk / parted
  if (
    /\b(mkfs(\.[a-z0-9]+)?|fdisk|parted)\b/.test(c) ||
    /\bdiskutil\s+erase/i.test(c)
  ) {
    return {
      ok: false,
      reason: "Refused: disk-formatting commands are not allowed.",
    };
  }
  // Fork bomb
  if (/:\s*\(\s*\)\s*\{\s*:\s*\|\s*:\s*&\s*\}\s*;/.test(c)) {
    return { ok: false, reason: "Refused: fork-bomb pattern detected." };
  }
  // Pipe-to-shell from network. The user already approves the command, but
  // this combo is overwhelmingly malicious-payload-shaped and worth flagging.
  if (/\b(curl|wget)\b[^|;&]*\|\s*(ba|z|k|d|fi|c)?sh\b/.test(c)) {
    return {
      ok: false,
      reason:
        "Refused: piping a network download directly into a shell is blocked. Download first, inspect, then run.",
    };
  }
  return { ok: true };
}
