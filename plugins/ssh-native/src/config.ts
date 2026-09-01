/**
 * Parse `~/.ssh/config` into the Host blocks we offer as connections. Only
 * concrete aliases are surfaced — wildcard patterns (`Host *`) are matching
 * rules, not destinations. ssh itself does the real resolution at connect time.
 */
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import type { SshHost } from "./types";

/** Pure parser — exported for unit tests. */
export function parseSshConfig(text: string): SshHost[] {
  const hosts: SshHost[] = [];
  let current: SshHost[] = [];

  for (const raw of text.split("\n")) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const m = line.match(/^([A-Za-z][A-Za-z0-9]*)[\s=]+(.+)$/);
    if (!m) continue;
    const key = m[1].toLowerCase();
    const value = m[2].trim();

    if (key === "host") {
      current = value
        .split(/\s+/)
        .filter((a) => a && !a.includes("*") && !a.includes("?"))
        .map((alias) => ({ alias }));
      for (const h of current) hosts.push(h);
      continue;
    }
    for (const h of current) {
      if (key === "hostname") h.hostName = value;
      else if (key === "user") h.user = value;
      else if (key === "port") {
        const p = Number(value);
        if (Number.isInteger(p) && p > 0 && p < 65536) h.port = p;
      }
    }
  }

  const seen = new Set<string>();
  return hosts.filter((h) => !seen.has(h.alias) && seen.add(h.alias));
}

/** Read + parse the user's ssh config; [] when absent/unreadable. */
export function listConfigHosts(): SshHost[] {
  try {
    return parseSshConfig(readFileSync(join(homedir(), ".ssh", "config"), "utf8"));
  } catch {
    return [];
  }
}
