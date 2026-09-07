import type { WorkspaceEnv } from "@termco/workspace-base";
import { native } from "../native/native";

const MEMORY_FILES = ["AGENTS.md", "CLAUDE.md", "TERMCO.md"] as const;
const PROJECT_MEMORY_MAX_BYTES = 32 * 1024;
const CACHE_TTL_MS = 30_000;

const cache = new Map<string, { content: string | null; readAt: number }>();

export async function readProjectMemory(
  workspaceRoot: string | null,
  workspace: WorkspaceEnv,
): Promise<string | null> {
  if (!workspaceRoot) return null;
  const directory = workspaceRoot.replace(/\/+$/, "");
  if (!directory) return null;
  const environment = workspace?.kind === "ssh"
    ? ["ssh", workspace.connectionId, workspace.host, workspace.user ?? "", workspace.port ?? 22]
    : workspace?.kind === "wsl" ? ["wsl", workspace.distro] : ["local"];
  const key = JSON.stringify([environment, directory]);
  const cached = cache.get(key);
  if (cached && Date.now() - cached.readAt < CACHE_TTL_MS) return cached.content;

  const found: Array<{ name: string; text: string }> = [];
  const seen = new Set<string>();
  for (const name of MEMORY_FILES) {
    try {
      const result = await native.readFile(`${directory}/${name}`, { optional: true, workspace });
      if (result.kind !== "text") continue;
      const text = result.content.trim();
      if (!text || seen.has(text)) continue;
      seen.add(text);
      found.push({ name, text });
    } catch {
      // A missing or unreadable optional memory file must not block the chat.
    }
  }

  let content = found.length === 0
    ? null
    : found.length === 1
      ? found[0].text
      : found.map((entry) => `### ${entry.name}\n${entry.text}`).join("\n\n");
  if (content && content.length > PROJECT_MEMORY_MAX_BYTES) {
    content = content.slice(0, PROJECT_MEMORY_MAX_BYTES);
  }
  cache.set(key, { content, readAt: Date.now() });
  return content;
}

export function clearProjectMemoryCache(): void {
  cache.clear();
}
