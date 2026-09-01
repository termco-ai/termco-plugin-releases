/**
 * Shell-history parsing + ranking. Pure (no I/O), fully unit-tested.
 */
export interface HistEntry {
  cmd: string;
  count: number;
  last: number;
}

const META = 0x83;

/** zsh metafies bytes >= 0x80 (0x83 then byte ^ 0x20); undo it on raw bytes. */
export function demetafy(bytes: Uint8Array): Uint8Array {
  const out: number[] = [];
  let i = 0;
  while (i < bytes.length) {
    if (bytes[i] === META && i + 1 < bytes.length) {
      out.push(bytes[i + 1] ^ 0x20);
      i += 2;
    } else {
      out.push(bytes[i]);
      i += 1;
    }
  }
  return Uint8Array.from(out);
}

function joinContinuations(content: string): string[] {
  const lines: string[] = [];
  let cur = "";
  for (let raw of content.split("\n")) {
    if (raw.endsWith("\r")) raw = raw.slice(0, -1);
    let trailing = 0;
    for (let i = raw.length - 1; i >= 0 && raw[i] === "\\"; i--) trailing++;
    if (trailing % 2 === 1) {
      cur += raw.slice(0, raw.length - 1);
      cur += "\n";
    } else {
      cur += raw;
      lines.push(cur);
      cur = "";
    }
  }
  if (cur.length > 0) lines.push(cur);
  return lines;
}

function pushCmd(out: [string, number][], cmd: string, ts: number): void {
  const c = cmd.trim();
  if (c.length > 0) out.push([c, ts]);
}

export function parseZsh(content: string): [string, number][] {
  const out: [string, number][] = [];
  for (let line of joinContinuations(content)) {
    line = line.replace(/\n+$/, "");
    if (!line) continue;
    if (line.startsWith(": ")) {
      const rest = line.slice(2);
      const semi = rest.indexOf(";");
      if (semi >= 0) {
        const tsPart = rest.slice(0, semi).split(":")[0]?.trim() ?? "";
        const ts = Number.parseInt(tsPart, 10);
        pushCmd(out, rest.slice(semi + 1), Number.isFinite(ts) ? ts : 0);
        continue;
      }
    }
    pushCmd(out, line, 0);
  }
  return out;
}

export function parseBash(content: string): [string, number][] {
  const out: [string, number][] = [];
  let ts = 0;
  for (let line of content.split("\n")) {
    if (line.endsWith("\r")) line = line.slice(0, -1);
    if (!line) continue;
    if (line.startsWith("#")) {
      const t = Number.parseInt(line.slice(1).trim(), 10);
      if (Number.isFinite(t) && /^#\s*-?\d+$/.test(line)) {
        ts = t;
        continue;
      }
    }
    pushCmd(out, line, ts);
    ts = 0;
  }
  return out;
}

function unescapeFish(s: string): string {
  let out = "";
  const chars = [...s];
  for (let i = 0; i < chars.length; i++) {
    if (chars[i] === "\\") {
      const next = chars[++i];
      if (next === "n") out += "\n";
      else if (next === "\\") out += "\\";
      else if (next !== undefined) out += next;
      else out += "\\";
    } else {
      out += chars[i];
    }
  }
  return out;
}

export function parseFish(content: string): [string, number][] {
  const out: [string, number][] = [];
  let pending: string | null = null;
  for (const line of content.split("\n")) {
    if (line.startsWith("- cmd: ")) {
      if (pending != null) pushCmd(out, pending, 0);
      pending = unescapeFish(line.slice("- cmd: ".length));
    } else if (line.trim().startsWith("when: ")) {
      if (pending != null) {
        const ts = Number.parseInt(line.trim().slice("when: ".length).trim(), 10);
        pushCmd(out, pending, Number.isFinite(ts) ? ts : 0);
        pending = null;
      }
    }
  }
  if (pending != null) pushCmd(out, pending, 0);
  return out;
}

export function sortRecent(v: HistEntry[]): void {
  v.sort((a, b) => (b.last !== a.last ? b.last - a.last : b.count - a.count));
}

export function buildIndex(entries: [string, number][]): HistEntry[] {
  const map = new Map<string, HistEntry>();
  for (const [cmd, ts] of entries) {
    let e = map.get(cmd);
    if (!e) {
      e = { cmd, count: 0, last: 0 };
      map.set(cmd, e);
    }
    e.count += 1;
    if (ts > e.last) e.last = ts;
  }
  const v = [...map.values()];
  sortRecent(v);
  return v;
}

export function suggest(index: HistEntry[], line: string): string | null {
  if (!line) return null;
  let best: HistEntry | null = null;
  for (const e of index) {
    if (e.cmd.length > line.length && e.cmd.startsWith(line)) {
      if (!best || e.last > best.last || (e.last === best.last && e.count > best.count)) {
        best = e;
      }
    }
  }
  return best ? best.cmd : null;
}

export function completeCommands(
  index: HistEntry[],
  pathCmds: string[],
  prefix: string,
  limit: number,
): string[] {
  const freq = new Map<string, number>();
  for (const e of index) {
    const w = e.cmd.split(/\s+/)[0] ?? "";
    if (w && w.startsWith(prefix)) freq.set(w, (freq.get(w) ?? 0) + e.count);
  }
  const histWords = [...freq.entries()].sort((a, b) =>
    b[1] !== a[1] ? b[1] - a[1] : a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0,
  );
  const seen = new Set<string>();
  const out: string[] = [];
  for (const [w] of histWords) {
    if (!seen.has(w)) {
      seen.add(w);
      out.push(w);
      if (out.length >= limit) return out;
    }
  }
  const paths = pathCmds.filter((c) => c.startsWith(prefix)).sort();
  for (const c of paths) {
    if (!seen.has(c)) {
      seen.add(c);
      out.push(c);
      if (out.length >= limit) break;
    }
  }
  return out;
}

export function list(index: HistEntry[], query: string, limit: number): string[] {
  const q = query.trim().toLowerCase();
  const out: string[] = [];
  for (const e of index) {
    if (!q || e.cmd.toLowerCase().includes(q)) {
      out.push(e.cmd);
      if (out.length >= limit) break;
    }
  }
  return out;
}
