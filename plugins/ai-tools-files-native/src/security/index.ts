import { basename, comparisonForm, isUnderProtected } from "./comparison";
import { PROTECTED_DIRS, SECRET_BASENAME_PATTERNS, WRITE_DENY_PREFIXES } from "./patterns";

export type SafetyResult = { ok: true } | { ok: false; reason: string };

export function checkReadable(path: string): SafetyResult {
  if (typeof path !== "string" || !path) return { ok: false, reason: "Refused: empty path." };
  if (/[\x00-\x1f]/.test(path)) return { ok: false, reason: "Refused: path contains control bytes." };
  const name = basename(path);
  if (SECRET_BASENAME_PATTERNS.some((pattern) => pattern.test(name))) {
    return { ok: false, reason: `Refused: "${name}" matches a sensitive-file pattern.` };
  }
  const comparison = comparisonForm(path);
  const protectedDirectory = PROTECTED_DIRS.find((directory) => isUnderProtected(comparison, directory));
  return protectedDirectory
    ? { ok: false, reason: `Refused: path is inside a protected directory (${protectedDirectory.slice(1)}).` }
    : { ok: true };
}

export function checkWritable(path: string): SafetyResult {
  const readable = checkReadable(path);
  if (!readable.ok) return readable;
  const comparison = comparisonForm(path);
  const rooted = comparison.startsWith("/") ? comparison : `/${comparison}`;
  const denied = WRITE_DENY_PREFIXES.find((prefix) => rooted.startsWith(prefix) || `${rooted}/`.startsWith(prefix));
  return denied
    ? { ok: false, reason: `Refused: writes under "${denied.replace(/\/$/, "")}" are not allowed.` }
    : { ok: true };
}

type Canonical = (path: string) => Promise<string>;

export async function checkReadableCanonical(path: string, canonicalize: Canonical): Promise<{ ok: true; canonical: string } | { ok: false; reason: string }> {
  const initial = checkReadable(path);
  if (!initial.ok) return initial;
  try {
    const canonical = await canonicalize(path);
    const result = checkReadable(canonical);
    return result.ok ? { ok: true, canonical } : result;
  } catch {
    return { ok: true, canonical: path };
  }
}

export async function checkWritableCanonical(path: string, canonicalize: Canonical): Promise<{ ok: true; canonical: string } | { ok: false; reason: string }> {
  const initial = checkWritable(path);
  if (!initial.ok) return initial;
  try {
    const canonical = await canonicalize(path);
    const result = checkWritable(canonical);
    return result.ok ? { ok: true, canonical } : result;
  } catch {
    const separator = Math.max(path.lastIndexOf("/"), path.lastIndexOf("\\"));
    if (separator > 0) {
      const parent = path.slice(0, separator);
      const tail = path.slice(separator);
      try {
        const canonical = `${await canonicalize(parent)}${tail}`;
        const result = checkWritable(canonical);
        return result.ok ? { ok: true, canonical } : result;
      } catch { /* surface the provider's real error during mutation */ }
    }
    return { ok: true, canonical: path };
  }
}
