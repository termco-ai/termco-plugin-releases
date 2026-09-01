export type SafetyResult = { ok: true } | { ok: false; reason: string };

const CATASTROPHIC_SHELL_PATTERNS: readonly RegExp[] = [
  /\brm\s+(?:-\S*\s+)*-\S*r\S*f|\brm\s+(?:-\S*\s+)*-\S*f\S*r/i,
  /\brm\s+-\S*r\S*\s+\/(?:\s|$)/i,
  /\bmkfs(\.\w+)?\b/i,
  /\bdd\b[^|&;]*\bof=\/dev\//i,
  /[:\w]+\s*\(\)\s*\{\s*[:\w]+\s*[|:]/,
  /\b(shutdown|reboot|halt|poweroff|init\s+0|init\s+6)\b/i,
  /\b(chmod|chown)\s+-\S*r\S*\s+\S*\s*\/(?:\s|$)/i,
  /\bgit\s+push\b[^\n]*(--force\b|--force-with-lease\b|\s-f\b)/i,
  /\bgit\s+reset\s+--hard\b/i,
  /\bgit\s+clean\s+-\S*f/i,
  /\bsudo\b/i,
  /\b(curl|wget)\b[^|]*\|\s*(sudo\s+)?\w*sh\b/i,
  />\s*\/dev\/(sd|nvme|disk|hd|mapper)/i,
  /\bkillall\b|\bkill\s+-9?\s+-1\b/i,
  /\b(npm|yarn|pnpm)\s+publish\b/i,
  /\bdocker\s+system\s+prune\b/i,
];

export function isCatastrophicShellCommand(command: string): boolean {
  return CATASTROPHIC_SHELL_PATTERNS.some((pattern) =>
    pattern.test(command.trim())
  );
}

/** Defense-in-depth after the user approval gate. */
export function checkShellCommand(command: string): SafetyResult {
  const value = command.trim();
  if (!value) return { ok: false, reason: "Refused: empty command." };
  if (/[\x00-\x1f]/.test(value)) {
    return { ok: false, reason: "Refused: commands must be one visible line without control characters." };
  }
  if (/[\u202A-\u202E\u2066-\u2069\u200E\u200F\u061C]/.test(value)) {
    return { ok: false, reason: "Refused: command contains Unicode directional overrides." };
  }
  if (/\brm\s+(-[a-zA-Z]*r[a-zA-Z]*f[a-zA-Z]*|-[a-zA-Z]*f[a-zA-Z]*r[a-zA-Z]*|--recursive\s+--force|--force\s+--recursive)\s+(['"]?\/['"]?\s*($|;|&|\|))/.test(value)) {
    return { ok: false, reason: "Refused: command attempts to recursively delete the filesystem root." };
  }
  if (/\brm\s+-[a-zA-Z]*r[a-zA-Z]*f[a-zA-Z]*\s+(['"]?(~(\/[^\s'"]*)?|\$\{?HOME\}?(\/[^\s'"]*)?)['"]?)(\s|$|;|&|\|)/.test(value)) {
    return { ok: false, reason: "Refused: command attempts to recursively delete the home directory." };
  }
  if (/--no-preserve-root/.test(value)) return { ok: false, reason: "Refused: --no-preserve-root is not allowed." };
  if (/\bdd\b[^|]*\bof=\/dev\/(disk|sd|nvme|hd)/i.test(value)) return { ok: false, reason: "Refused: writing directly to a block device is not allowed." };
  if (/\b(mkfs(\.[a-z0-9]+)?|fdisk|parted)\b/.test(value) || /\bdiskutil\s+erase/i.test(value)) return { ok: false, reason: "Refused: disk-formatting commands are not allowed." };
  if (/\:\s*\(\s*\)\s*\{\s*\:\s*\|\s*\:\s*&\s*\}\s*;/.test(value)) return { ok: false, reason: "Refused: fork-bomb pattern detected." };
  if (/\b(curl|wget)\b[^|;&]*\|\s*(ba|z|k|d|fi|c)?sh\b/.test(value)) return { ok: false, reason: "Refused: download and inspect network content before executing it." };
  return { ok: true };
}
