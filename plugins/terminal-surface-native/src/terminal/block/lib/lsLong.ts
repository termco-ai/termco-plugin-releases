/**
 * Long-format `ls -l` output parser for the files widget. The goal is to
 * KEEP the information the user asked for — permissions, owner, size,
 * date — while making each entry clickable.
 *
 * Deliberately interpretation-free: only the leading permissions field is
 * recognized structurally; the entry NAME is found by suffix-matching the
 * line against the directory's real entry names (so rigs in names,
 * locale-formatted dates, `-h` sizes, extra columns from exotic flags all
 * survive verbatim in the middle "meta" text). Lines that don't parse are
 * skipped; a parse that yields nothing signals the caller to fall back to
 * the block's real terminal rows.
 */

export type LsLongRow = {
  /** Leading mode string, e.g. "-rw-r--r--@" or "drwxr-xr-x". */
  perms: string;
  /** Everything between perms and name, verbatim (links owner group size date). */
  meta: string;
  name: string;
  /** Symlink target when the line reads "name -> target". */
  linkTarget?: string;
  /** Name confirmed against the real directory listing (safe to open). */
  verified: boolean;
  /**
   * `meta` decomposed into the standard long-format columns, when it has
   * that shape — lets the widget align columns while `meta` stays the
   * verbatim source of truth (exotic flags render the string as-is).
   */
  parts?: {
    links: string;
    owner: string;
    group: string;
    size: string;
    date: string;
  };
};

function decomposeMeta(meta: string): LsLongRow["parts"] {
  const f = meta.split(" ");
  if (f.length < 5) return undefined;
  return {
    links: f[0],
    owner: f[1],
    group: f[2],
    size: f[3],
    date: f.slice(4).join(" "),
  };
}

/** BSD/GNU mode string: type char + 9 mode chars + optional @ (xattr) / + (ACL). */
const PERMS_RE = /^[bcdlpsw-][rwxsStT-]{9}[@+]?$/;

function lsFlags(command: string): string {
  return command
    .trim()
    .split(/\s+/)
    .slice(1)
    .filter((t) => t.startsWith("-") && !t.startsWith("--"))
    .map((t) => t.slice(1))
    .join("");
}

/** Does the invocation print the long format? */
export function isLongFormat(command: string): boolean {
  const f = lsFlags(command);
  return (
    f.includes("l") || f.includes("o") || f.includes("n") || f.includes("g")
  );
}

/** Does the invocation include dotfiles? */
export function wantsHidden(command: string): boolean {
  const f = lsFlags(command);
  return f.includes("a") || f.includes("A");
}

type NameHit = { name: string; linkTarget?: string; nameStart: number };

/** Longest known name that terminates `text` (after a space). */
function matchNameSuffix(
  text: string,
  namesLongestFirst: readonly string[],
): NameHit | null {
  const arrow = text.lastIndexOf(" -> ");
  if (arrow > 0) {
    const head = text.slice(0, arrow);
    const hit = matchNameSuffix(head, namesLongestFirst);
    if (hit) return { ...hit, linkTarget: text.slice(arrow + 4) };
  }
  for (const n of namesLongestFirst) {
    if (text.endsWith(` ${n}`)) {
      return { name: n, nameStart: text.length - n.length };
    }
  }
  return null;
}

export function parseLsLong(
  output: string,
  knownNames: readonly string[],
): LsLongRow[] | null {
  const names = [...knownNames, "..", "."].sort((a, b) => b.length - a.length);
  const lines = output.split("\n");
  const rows: LsLongRow[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    const perms = line.split(/\s+/, 1)[0];
    // Skips "total 8" / localized variants and wrap-continuation junk.
    if (!PERMS_RE.test(perms)) continue;

    let hit = matchNameSuffix(line, names);
    let consumedNext = false;
    if (!hit && i + 1 < lines.length) {
      // A name wrapped across two buffer rows: the continuation line won't
      // start with a mode string. The terminal wraps mid-run (no separator).
      const next = lines[i + 1].trim();
      if (next && !PERMS_RE.test(next.split(/\s+/, 1)[0])) {
        hit =
          matchNameSuffix(line + next, names) ??
          matchNameSuffix(`${line} ${next}`, names);
        consumedNext = hit !== null;
      }
    }

    let row: LsLongRow | null = null;
    if (hit) {
      const meta = line
        .slice(perms.length, Math.min(hit.nameStart, line.length))
        .replace(/\s+/g, " ")
        .trim();
      if (hit.name !== "." && hit.name !== "..") {
        row = {
          perms,
          meta,
          name: hit.name,
          linkTarget: hit.linkTarget,
          verified: knownNames.includes(hit.name),
          parts: decomposeMeta(meta),
        };
      } else {
        row = null; // "." / ".." are noise in a card
      }
      if (consumedNext) i++;
    } else {
      // Unverifiable line (deleted file, exotic format): classic column
      // guess — fields 8+ are the name. Displayed, but not clickable.
      const fields = line.split(/\s+/);
      if (fields.length >= 9) {
        const arrow = fields.indexOf("->");
        const nameFields = arrow > 0 ? fields.slice(8, arrow) : fields.slice(8);
        const meta = fields.slice(1, 8).join(" ");
        row = {
          perms,
          meta,
          name: nameFields.join(" "),
          linkTarget: arrow > 0 ? fields.slice(arrow + 1).join(" ") : undefined,
          verified: false,
          parts: decomposeMeta(meta),
        };
      }
    }
    if (row) rows.push(row);
  }

  return rows.length > 0 ? rows : null;
}
