import type { AiLibraryMcpServer } from "@termco/ai-library-base";

export function normalizeHandle(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9-]/g, "")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function isValidHandle(handle: string): boolean {
  return /^[a-z0-9][a-z0-9-]*$/.test(handle);
}

function strings(value: unknown): Record<string, string> | undefined {
  if (!value || typeof value !== "object") return undefined;
  const result: Record<string, string> = {};
  for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
    if (typeof item === "string") result[key] = item;
  }
  return Object.keys(result).length ? result : undefined;
}

export function parseMcpConfig(text: string): {
  servers: AiLibraryMcpServer[];
  unsupported: Array<{ name: string; reason: string }>;
} {
  const servers: AiLibraryMcpServer[] = [];
  const unsupported: Array<{ name: string; reason: string }> = [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return { servers, unsupported };
  }
  if (!parsed || typeof parsed !== "object") return { servers, unsupported };
  const root = parsed as Record<string, unknown>;
  const bag = (root.mcpServers ?? root.servers) as Record<string, unknown> | undefined;
  if (!bag || typeof bag !== "object") return { servers, unsupported };
  for (const [name, raw] of Object.entries(bag)) {
    if (!raw || typeof raw !== "object") continue;
    const value = raw as Record<string, unknown>;
    if (typeof value.command === "string" && value.command) {
      servers.push({
        name,
        command: value.command,
        args: Array.isArray(value.args) ? value.args.map(String) : [],
        env: strings(value.env),
      });
    } else if (typeof value.url === "string" && value.url) {
      servers.push({
        name,
        url: value.url,
        headers: strings(value.headers),
        transport: value.type === "sse" ? "sse" : value.type ? "http" : undefined,
        oauthClientId: typeof value.clientId === "string" ? value.clientId : undefined,
        oauthScopes: Array.isArray(value.scopes)
          ? value.scopes.map(String).join(" ")
          : typeof value.scopes === "string"
            ? value.scopes
            : undefined,
      });
    } else {
      unsupported.push({ name, reason: "No `command` or `url` — nothing to run." });
    }
  }
  return { servers, unsupported };
}
