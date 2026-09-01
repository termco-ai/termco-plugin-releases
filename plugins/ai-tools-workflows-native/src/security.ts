export type SafetyResult = { ok: true } | { ok: false; reason: string };

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
  if (/:\s*\(\s*\)\s*\{\s*:\s*\|\s*:\s*&\s*\}\s*;/.test(value)) return { ok: false, reason: "Refused: fork-bomb pattern detected." };
  if (/\b(curl|wget)\b[^|;&]*\|\s*(ba|z|k|d|fi|c)?sh\b/.test(value)) return { ok: false, reason: "Refused: download and inspect network content before executing it." };
  return { ok: true };
}
