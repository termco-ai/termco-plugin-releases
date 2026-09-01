/**
 * Minimal YAML-frontmatter splitter — enough for SKILL.md / agent .md files,
 * whose frontmatter is shallow `key: value` (+ the occasional comma list). We
 * deliberately avoid a YAML dependency: these files use flat scalars and simple
 * lists, and a tolerant parser beats a strict one that rejects a stray tab.
 */

import type { AiToolGroupId as ToolGroupId } from "@termco/ai-library-base";

const TOOL_GROUP_IDS: readonly ToolGroupId[] = [
  "files",
  "terminal",
  "git",
  "containers",
  "browser",
  "system",
  "agents",
  "ui",
  "plugin-dev",
];

export type Frontmatter = {
  data: Record<string, string>;
  body: string;
};

const FENCE = /^---[ \t]*\r?\n/;

/** Split `--- … ---` frontmatter from the body. No fence → all body, empty data. */
export function parseFrontmatter(content: string): Frontmatter {
  if (!FENCE.test(content)) return { data: {}, body: content };
  // Find the closing fence line after the opening one.
  const afterOpen = content.replace(FENCE, "");
  const close = afterOpen.search(/\r?\n---[ \t]*(\r?\n|$)/);
  if (close === -1) return { data: {}, body: content };
  const head = afterOpen.slice(0, close);
  const body = afterOpen
    .slice(close)
    .replace(/^\r?\n---[ \t]*\r?\n?/, "")
    .replace(/^\r?\n/, "");
  const data: Record<string, string> = {};
  for (const raw of head.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const i = line.indexOf(":");
    if (i === -1) continue;
    const key = line.slice(0, i).trim().toLowerCase();
    let val = line.slice(i + 1).trim();
    // Strip matching surrounding quotes.
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    if (key) data[key] = val;
  }
  return { data, body };
}

/** Read `name`, falling back to a folder/file name. */
export function fmName(fm: Frontmatter, fallback: string): string {
  return fm.data.name?.trim() || fallback;
}

/** Read the description, tolerating a couple of key spellings. */
export function fmDescription(fm: Frontmatter): string | undefined {
  return fm.data.description?.trim() || fm.data.desc?.trim() || undefined;
}

/** `when_to_use` / `whenToUse`. */
export function fmWhenToUse(fm: Frontmatter): string | undefined {
  return fm.data.when_to_use?.trim() || fm.data.whentouse?.trim() || undefined;
}

// Loose map from common coding-agent tool names to Termco groups.
const TOOL_TO_GROUP: Record<string, ToolGroupId> = {
  read: "files",
  write: "files",
  edit: "files",
  multiedit: "files",
  grep: "files",
  glob: "files",
  ls: "files",
  bash: "terminal",
  shell: "terminal",
  git: "git",
  docker: "containers",
  webfetch: "browser",
  websearch: "browser",
  browser: "browser",
  task: "agents",
  agent: "agents",
};

/**
 * Map a frontmatter `allowed-tools` value to Termco tool groups. Returns
 * `undefined` (= inherit / all) when absent or nothing maps — skills rarely
 * restrict, and an empty scope would wrongly strip every tool.
 */
export function fmAllowedGroups(fm: Frontmatter): ToolGroupId[] | undefined {
  const raw = fm.data["allowed-tools"] || fm.data.tools;
  if (!raw) return undefined;
  const groups = new Set<ToolGroupId>();
  for (const token of raw.split(/[,\s]+/)) {
    const key = token
      .trim()
      .toLowerCase()
      .replace(/\(.*\)$/, "");
    if (!key) continue;
    // A Termco group id used directly (e.g. "files") also works.
    if ((TOOL_GROUP_IDS as readonly string[]).includes(key)) {
      groups.add(key as ToolGroupId);
      continue;
    }
    const g = TOOL_TO_GROUP[key];
    if (g) groups.add(g);
  }
  return groups.size > 0 ? [...groups] : undefined;
}
