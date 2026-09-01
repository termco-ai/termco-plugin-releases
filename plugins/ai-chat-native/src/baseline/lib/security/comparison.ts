/**
 * Path normalization used *only* for deny-list matching — never as a real path.
 *
 * Defense-in-depth notes:
 *  - Comparison surface is lowercased *only for matching*. Original path is
 *    preserved for basename pattern checks and error messages.
 *  - Windows drive prefix (e.g. `C:`) is stripped from the comparison form so
 *    Unix-style root prefix checks behave consistently on both platforms.
 *  - Protected directories match exact-equal-or-descendant, not raw
 *    substring-with-trailing-slash. Bare names (`/Users/me/.ssh`) and
 *    case-variants (`/Users/me/.SSH/config` on macOS/Windows case-insensitive
 *    filesystems) are caught.
 *  - The caller is expected to additionally validate the *canonical* path
 *    (post symlink resolution) via `native.canonicalize` + a second
 *    `checkReadable` pass, since a symlink at an "innocent" path can point
 *    into a protected directory.
 */

/** Last path segment, splitting on either separator. */
export function basename(p: string): string {
  const i = Math.max(p.lastIndexOf("/"), p.lastIndexOf("\\"));
  return i >= 0 ? p.slice(i + 1) : p;
}

/**
 * Build a normalized *comparison surface* — never used as a real path:
 *  - back-slashes -> forward-slashes
 *  - strip Windows drive prefix (e.g. `C:`)
 *  - strip extended-length prefix `//?/` (`//?/UNC/` folds into UNC form)
 *  - strip NTFS alternate-data-stream suffix (`name:stream` / `name::$DATA`)
 *    from each path segment — Windows reads `foo:stream` as `foo` for our
 *    purposes, so the comparison surface should too
 *  - strip trailing dots/spaces from each segment — Windows discards these
 *    at open time, so `.env.` and `.env ` open `.env`
 *  - collapse duplicate slashes
 *  - lowercase (so case variants match on case-insensitive filesystems)
 *  - drop trailing slash (except for root)
 */
export function comparisonForm(p: string): string {
  let s = p.replace(/\\/g, "/");
  // Extended-length prefix. \\?\UNC\server\share → //server/share (same as a
  // regular UNC path); \\?\C:\... → C:/... so the drive strip below applies.
  s = s.replace(/^\/\/\?\/unc\//i, "//");
  s = s.replace(/^\/\/\?\//, "");
  // Drive prefix: C:/foo → /foo. Important: do this BEFORE lowercasing so we
  // don't have to special-case "c:" vs "C:".
  s = s.replace(/^[a-zA-Z]:/, "");
  // Strip NTFS alternate-data-stream syntax from each segment. `name:stream`
  // and `name::$DATA` both read the same underlying file from `name`, so
  // they must compare-equal to `name`.
  s = s
    .split("/")
    .map((seg) => {
      const colon = seg.indexOf(":");
      return colon === -1 ? seg : seg.slice(0, colon);
    })
    .join("/");
  // Strip trailing dots/spaces from each segment (Windows behavior).
  s = s
    .split("/")
    .map((seg) => seg.replace(/[.\s]+$/, ""))
    .join("/");
  // Collapse duplicate slashes (//foo → /foo). Preserve a possible leading
  // single slash.
  s = s.replace(/\/{2,}/g, "/");
  s = s.toLowerCase();
  // Drop trailing slash so "/foo/" and "/foo" compare equal.
  if (s.length > 1 && s.endsWith("/")) s = s.slice(0, -1);
  return s;
}

/** True when `cmp` is exactly `dir` or lives beneath it (segment-aware). */
export function isUnderProtected(cmp: string, dir: string): boolean {
  // Protected dirs (`/.ssh`, `/.config/gh`, …) live under the user's home or
  // somewhere else in the tree — they are NOT root-anchored. Match the dir as
  // a path-segment substring: append `/` to both sides so we don't match
  // false positives like `/.sshx` against `/.ssh`.
  //
  //   "/users/me/.ssh/config" + "/" → contains "/.ssh/" ✓
  //   "/users/me/.ssh"        + "/" → contains "/.ssh/" ✓
  //   "/users/me/.sshx/file"  + "/" → does not contain "/.ssh/" ✓
  return (cmp + "/").includes(dir + "/");
}

/** Human-readable form of a protected dir for error messages. */
export function describeProtected(dir: string): string {
  // "/.ssh" -> ".ssh", "/.config/gh" -> ".config/gh"
  return dir.replace(/^\//, "");
}
