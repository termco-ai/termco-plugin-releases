/**
 * Path-safety guards for AI file tools: read/write allow-checks plus the
 * two-phase canonical variants that defend against symlink traversal.
 */

import {
  basename,
  comparisonForm,
  describeProtected,
  isUnderProtected,
} from "./comparison";
import {
  PROTECTED_DIRS,
  SECRET_BASENAME_PATTERNS,
  WRITE_DENY_PREFIXES,
} from "./patterns";
import type { SafetyResult } from "./types";

export function checkReadable(path: string): SafetyResult {
  if (typeof path !== "string" || path.length === 0) {
    return { ok: false, reason: "Refused: empty path." };
  }
  // Reject NUL and control bytes in paths — these are never legitimate and
  // are a classic truncation/injection vector.
  if (/[\x00-\x1f]/.test(path)) {
    return { ok: false, reason: "Refused: path contains control bytes." };
  }

  const base = basename(path);
  for (const re of SECRET_BASENAME_PATTERNS) {
    if (re.test(base)) {
      return {
        ok: false,
        reason: `Refused: "${base}" matches a sensitive-file pattern.`,
      };
    }
  }

  const cmp = comparisonForm(path);
  for (const dir of PROTECTED_DIRS) {
    if (isUnderProtected(cmp, dir)) {
      return {
        ok: false,
        reason: `Refused: path is inside a protected directory (${describeProtected(dir)}).`,
      };
    }
  }

  return { ok: true };
}

export function checkWritable(path: string): SafetyResult {
  // Writes inherit all read restrictions, plus system-directory blocks.
  const r = checkReadable(path);
  if (!r.ok) return r;

  const cmp = comparisonForm(path);
  // Ensure the comparison surface has a leading separator for prefix matching.
  const cmpForPrefix = cmp.startsWith("/") ? cmp : `/${cmp}`;
  for (const prefix of WRITE_DENY_PREFIXES) {
    if (
      cmpForPrefix.startsWith(prefix) ||
      `${cmpForPrefix}/`.startsWith(prefix)
    ) {
      return {
        ok: false,
        reason: `Refused: writes under "${prefix.replace(/\/$/, "")}" are not allowed.`,
      };
    }
  }
  return { ok: true };
}

/**
 * Two-phase safety check that also defends against symlink traversal: first
 * checks the literal path, then (if it exists) canonicalizes it via the
 * native FS and re-checks the resolved path. A symlink at `./innocent.txt`
 * pointing into `~/.ssh/id_rsa` is caught on the second pass.
 *
 * Returns the canonical path on success so callers can use it for the actual
 * read — avoids TOCTOU between the safety check and the read.
 */
export async function checkReadableCanonical(
  path: string,
  canonicalize: (p: string) => Promise<string>,
): Promise<{ ok: true; canonical: string } | { ok: false; reason: string }> {
  const initial = checkReadable(path);
  if (!initial.ok) return initial;
  let canonical: string;
  try {
    canonical = await canonicalize(path);
  } catch {
    // Path doesn't exist yet — fine for the read tool to surface ENOENT.
    return { ok: true, canonical: path };
  }
  // Always recheck — even when canonicalize returns the same string, the
  // checks themselves can have OS-specific gaps (NTFS streams, trailing
  // dot/rig) that warrant a second pass against the comparison form.
  const recheck = checkReadable(canonical);
  if (!recheck.ok) return recheck;
  return { ok: true, canonical };
}

/**
 * Same pattern as {@link checkReadableCanonical} but for writes. The canonical
 * path is only available if the file already exists — for new-file creates
 * we additionally canonicalize the parent directory.
 */
export async function checkWritableCanonical(
  path: string,
  canonicalize: (p: string) => Promise<string>,
): Promise<{ ok: true; canonical: string } | { ok: false; reason: string }> {
  const initial = checkWritable(path);
  if (!initial.ok) return initial;
  // Try canonicalizing the target itself first.
  try {
    const canonical = await canonicalize(path);
    // Always recheck the canonical form — same rationale as checkReadableCanonical.
    const recheck = checkWritable(canonical);
    if (!recheck.ok) return recheck;
    return { ok: true, canonical };
  } catch {
    // Target doesn't exist — canonicalize the parent so we still catch a
    // symlinked parent directory (`./project -> /Users/me/.ssh`).
    const lastSep = Math.max(path.lastIndexOf("/"), path.lastIndexOf("\\"));
    if (lastSep > 0) {
      const parent = path.slice(0, lastSep);
      const tail = path.slice(lastSep);
      try {
        const canonParent = await canonicalize(parent);
        const recheckParent = checkWritable(canonParent + tail);
        if (!recheckParent.ok) return recheckParent;
        return { ok: true, canonical: canonParent + tail };
      } catch {
        // Parent doesn't exist either — let the caller surface the actual error.
      }
    }
    return { ok: true, canonical: path };
  }
}
