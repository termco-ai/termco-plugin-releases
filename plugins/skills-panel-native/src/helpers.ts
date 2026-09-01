import type { AiLibraryMcpServer, AiToolGroupId } from "@termco/ai-library-base";

export type Frontmatter = { data: Record<string, string>; body: string };
export function parseFrontmatter(content: string): Frontmatter {
  if (!/^---[ \t]*\r?\n/.test(content)) return { data: {}, body: content };
  const afterOpen = content.replace(/^---[ \t]*\r?\n/, "");
  const close = afterOpen.search(/\r?\n---[ \t]*(\r?\n|$)/);
  if (close < 0) return { data: {}, body: content };
  const data: Record<string, string> = {};
  for (const raw of afterOpen.slice(0, close).split(/\r?\n/)) {
    const line = raw.trim();
    const index = line.indexOf(":");
    if (!line || line.startsWith("#") || index < 0) continue;
    const key = line.slice(0, index).trim().toLowerCase();
    let value = line.slice(index + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (key) data[key] = value;
  }
  const body = afterOpen
    .slice(close)
    .replace(/^\r?\n---[ \t]*\r?\n?/, "")
    .replace(/^\r?\n/, "");
  return { data, body };
}
export const fmName = (fm: Frontmatter, fallback: string) => fm.data.name?.trim() || fallback;
export const fmDescription = (fm: Frontmatter) => fm.data.description?.trim() || fm.data.desc?.trim() || undefined;
export const fmWhenToUse = (fm: Frontmatter) => fm.data.when_to_use?.trim() || fm.data.whentouse?.trim() || undefined;

const GROUPS: readonly AiToolGroupId[] = ["files", "terminal", "git", "containers", "browser", "system", "agents", "ui", "plugin-dev"];
const TOOL_GROUP: Record<string, AiToolGroupId> = {
  read: "files", write: "files", edit: "files", multiedit: "files", grep: "files", glob: "files", ls: "files",
  bash: "terminal", shell: "terminal", git: "git", docker: "containers", webfetch: "browser", websearch: "browser",
  browser: "browser", task: "agents", agent: "agents",
};
export function fmAllowedGroups(fm: Frontmatter): AiToolGroupId[] | undefined {
  const raw = fm.data["allowed-tools"] || fm.data.tools;
  if (!raw) return undefined;
  const groups = new Set<AiToolGroupId>();
  for (const token of raw.split(/[,\s]+/)) {
    const key = token.trim().toLowerCase().replace(/\(.*\)$/, "");
    if ((GROUPS as readonly string[]).includes(key)) groups.add(key as AiToolGroupId);
    else if (TOOL_GROUP[key]) groups.add(TOOL_GROUP[key]);
  }
  return groups.size ? [...groups] : undefined;
}

export function normalizeHandle(raw: string): string {
  return raw.trim().toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "").replace(/-+/g, "-").replace(/^-+|-+$/g, "");
}

function stringRecord(value: unknown): Record<string, string> | undefined {
  if (!value || typeof value !== "object") return undefined;
  const result: Record<string, string> = {};
  for (const [key, item] of Object.entries(value as Record<string, unknown>)) if (typeof item === "string") result[key] = item;
  return Object.keys(result).length ? result : undefined;
}
export function parseMcpConfig(text: string): { servers: AiLibraryMcpServer[]; unsupported: Array<{ name: string; reason: string }> } {
  const servers: AiLibraryMcpServer[] = [];
  const unsupported: Array<{ name: string; reason: string }> = [];
  let parsed: unknown;
  try { parsed = JSON.parse(text); } catch { return { servers, unsupported }; }
  if (!parsed || typeof parsed !== "object") return { servers, unsupported };
  const root = parsed as Record<string, unknown>;
  const bag = (root.mcpServers ?? root.servers) as Record<string, unknown> | undefined;
  if (!bag || typeof bag !== "object") return { servers, unsupported };
  for (const [name, raw] of Object.entries(bag)) {
    if (!raw || typeof raw !== "object") continue;
    const item = raw as Record<string, unknown>;
    if (typeof item.command === "string" && item.command) servers.push({ name, command: item.command, args: Array.isArray(item.args) ? item.args.map(String) : [], env: stringRecord(item.env) });
    else if (typeof item.url === "string" && item.url) servers.push({ name, url: item.url, headers: stringRecord(item.headers), transport: item.type === "sse" ? "sse" : item.type ? "http" : undefined });
    else unsupported.push({ name, reason: "No `command` or `url` — nothing to run." });
  }
  return { servers, unsupported };
}

export function skillScopeRootKey(root: string, scopeKey: string): string {
  return `${scopeKey}::${root.replace(/\/+$/, "")}`;
}
