/** Discover project and user slash commands from backend configuration files. */

import { readdirSync, readFileSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { join, relative, sep } from "node:path";

/** One discovered slash-command. */
export type SlashCommand = {
  /** Invocation name WITHOUT the leading slash (nested dirs → `dir:name`). */
  name: string;
  /** One-line description (frontmatter `description:` or first `# heading`). */
  description?: string;
  scope: "project" | "user";
};

/** Pull a one-line description from a command file's frontmatter or first
 * heading. Bounded read — command files are small. */
export function describeCommand(text: string): string | undefined {
  // YAML frontmatter `description:` (between leading `---` fences).
  const fm = text.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (fm) {
    const line = fm[1]
      .split(/\r?\n/)
      .find((l) => /^description\s*:/i.test(l));
    if (line) {
      const v = line.replace(/^description\s*:/i, "").trim().replace(/^["']|["']$/g, "");
      if (v) return v.slice(0, 120);
    }
  }
  // First Markdown heading.
  const heading = text.match(/^#{1,6}\s+(.+)$/m);
  if (heading) return heading[1].trim().slice(0, 120);
  // First non-empty, non-frontmatter line.
  for (const l of text.split(/\r?\n/)) {
    const t = l.trim();
    if (t && t !== "---") return t.slice(0, 120);
  }
  return undefined;
}

/** Recursively collect `.md` command files under a dir (bounded depth). */
function collect(dir: string, depth = 3, acc: string[] = []): string[] {
  if (depth < 0) return acc;
  let entries: import("node:fs").Dirent[];
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return acc;
  }
  for (const e of entries) {
    const full = join(dir, e.name);
    if (e.isDirectory()) collect(full, depth - 1, acc);
    else if (e.isFile() && e.name.endsWith(".md")) acc.push(full);
  }
  return acc;
}

/** Convert a nested command path into its colon-separated invocation name. */
function nameFromPath(root: string, file: string): string {
  const rel = relative(root, file).replace(/\.md$/, "");
  return rel.split(sep).join(":");
}

function readDir(root: string, scope: SlashCommand["scope"]): SlashCommand[] {
  try {
    if (!statSync(root).isDirectory()) return [];
  } catch {
    return [];
  }
  const out: SlashCommand[] = [];
  for (const file of collect(root)) {
    let description: string | undefined;
    try {
      description = describeCommand(readFileSync(file, "utf8"));
    } catch {
      /* unreadable — name only */
    }
    out.push({ name: nameFromPath(root, file), scope, description });
  }
  return out;
}

/** List custom slash-commands for a run's cwd: project then user scope, deduped
 * by name (project wins), alphabetical. */
export function listSlashCommands(cwd: string): SlashCommand[] {
  const project = cwd ? readDir(join(cwd, ".claude", "commands"), "project") : [];
  const user = readDir(join(homedir(), ".claude", "commands"), "user");
  const byName = new Map<string, SlashCommand>();
  for (const c of user) byName.set(c.name, c);
  for (const c of project) byName.set(c.name, c); // project overrides user
  return [...byName.values()].sort((a, b) => a.name.localeCompare(b.name));
}
// Owned by the coding-agent-native provider plugin.
