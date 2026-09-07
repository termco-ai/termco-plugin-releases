import type { AiToolDefinition, AiToolRuntime } from "@termco/ai-tools-base";
import type { WorkspaceFilesCapability } from "@termco/files-base";
import type { WorkspaceEnv } from "@termco/workspace-base";
import { checkReadable, checkReadableCanonical } from "./security";
import { scopePath } from "./security/scope";

export function workspaceTarget(env: WorkspaceEnv): string {
  if (env?.kind === "ssh") return `SSH: ${env.user ? `${env.user}@` : ""}${env.host}:${env.port ?? 22}`;
  if (env?.kind === "wsl") return `WSL: ${env.distro}`;
  return "Local computer";
}

export function resolveFilePath(path: string, runtime: AiToolRuntime): string {
  if (path.startsWith("/") || path.startsWith("\\\\") || /^[a-zA-Z]:[\\/]/.test(path)) return path;
  const cwd = runtime.getCwd?.();
  if (!cwd) throw new Error(`cannot resolve relative path "${path}": no active terminal cwd. Pass an absolute path.`);
  const separator = cwd.includes("\\") && !cwd.includes("/") ? "\\" : "/";
  return cwd.endsWith(separator) ? `${cwd}${path}` : `${cwd}${separator}${path}`;
}

export function readEnvironment(runtime: AiToolRuntime): WorkspaceEnv {
  return { ...(runtime.getWorkspaceEnv?.() ?? { kind: "local" }) };
}

function scopeKey(runtime: AiToolRuntime, env: WorkspaceEnv): string | null {
  const session = runtime.getSessionId?.();
  if (!session) return null;
  return JSON.stringify([session, env?.kind ?? "local", env?.kind === "ssh"
    ? [env.connectionId, env.host, env.user ?? "", env.port ?? 22]
    : env?.kind === "wsl" ? env.distro : ""]);
}

export class DirectoryReadAccess {
  private readonly grants = new Map<string, Set<string>>();
  constructor(private readonly files: WorkspaceFilesCapability) {}

  roots(runtime: AiToolRuntime, env: WorkspaceEnv): readonly string[] {
    const key = scopeKey(runtime, env);
    return key ? [...(this.grants.get(key) ?? [])] : [];
  }

  async readable(path: string, runtime: AiToolRuntime, allowGrants = true) {
    const workspace = readEnvironment(runtime);
    const approvedRoots = allowGrants ? this.roots(runtime, workspace) : [];
    const safety = await checkReadableCanonical(path, (value) => this.files.canonicalize(value, workspace), approvedRoots);
    if (safety.ok) return { ok: true as const, path: safety.canonical, workspace, approvedRoots };
    const canRequest = allowGrants && checkReadable(path, [path]).ok;
    return {
      ok: false as const,
      result: {
        error: safety.reason,
        path,
        ...(canRequest ? {
          requires_directory_approval: true,
          hint: "Request read/search access with request_directory_access for the smallest needed directory, then retry after approval.",
          target: workspaceTarget(workspace),
        } : {}),
      },
    };
  }

  tools(runtime: AiToolRuntime): Record<string, AiToolDefinition> {
    return {
      request_directory_access: {
        description: `Ask the user to allow reading and searching a directory in this chat on ${workspaceTarget(readEnvironment(runtime))}. Use the smallest required absolute directory and explain why. Access ends when revoked, the plugin reloads, or Termco restarts. Sensitive files and write restrictions remain enforced.`,
        inputSchema: {
          type: "object",
          properties: {
            path: { type: "string", description: "Absolute canonical directory path to allow, including its descendants." },
            target: { type: "string", description: "Exact target label from the access error or this tool's description." },
            reason: { type: "string", minLength: 1, description: "Why this directory must be read or searched." },
          },
          required: ["path", "target", "reason"],
          additionalProperties: false,
        },
        needsApproval: true,
        alwaysNeedsApproval: true,
        concurrency: "exclusive",
        execute: async (raw, context) => {
          const input = raw as { path?: unknown; target?: unknown; reason?: unknown };
          const workspace = readEnvironment(runtime);
          const key = scopeKey(runtime, workspace);
          if (!key) return { error: "Directory access requires an active chat session." };
          if (input.target !== workspaceTarget(workspace)) return { error: "The target changed. Request approval again for the current target.", target: workspaceTarget(workspace) };
          if (typeof input.reason !== "string" || !input.reason.trim()) return { error: "Explain why this directory needs access." };
          const path = typeof input.path === "string" ? input.path : "";
          if (!path || !(/^(?:\/|\\\\|[a-zA-Z]:[\\/])/.test(path))) return { error: "Request an absolute directory path." };
          const safety = checkReadable(path, [path]);
          if (!safety.ok) return { error: safety.reason };
          try {
            const canonical = await this.files.canonicalize(path, workspace);
            if (scopePath(canonical) !== scopePath(path) || /(^|[/\\])\.{1,2}([/\\]|$)/.test(path)) return { error: "The directory resolves to a different path. Request approval for the canonical directory.", canonical_path: canonical };
            const checked = checkReadable(canonical, [canonical]);
            if (!checked.ok) return { error: checked.reason };
            const info = await this.files.stat(canonical, workspace);
            if (!info || typeof info !== "object" || !("kind" in info) || info.kind !== "dir") return { error: "Access can only be granted to an existing directory." };
            if (context?.signal.aborted) return { error: "Directory access request was cancelled." };
            if (key !== scopeKey(runtime, readEnvironment(runtime))) return { error: "The chat or target changed. Request approval again." };
            const roots = this.grants.get(key) ?? new Set<string>();
            roots.add(canonical);
            this.grants.set(key, roots);
            return { ok: true, path: canonical, target: workspaceTarget(workspace), access: "read-and-search", scope: "current-chat", revoke_with: "revoke_directory_access" };
          } catch (error) {
            return { error: `Cannot verify directory access: ${String(error)}` };
          }
        },
      },
      revoke_directory_access: {
        description: "Revoke previously approved directory read/search access in the current chat and target.",
        concurrency: "exclusive",
        inputSchema: { type: "object", properties: { path: { type: "string" } }, required: ["path"], additionalProperties: false },
        execute: (raw) => {
          const path = String((raw as {path?: unknown}).path ?? "");
          const key = scopeKey(runtime, readEnvironment(runtime));
          const roots = key ? this.grants.get(key) : undefined;
          for (const root of roots ?? []) if (scopePath(root) === scopePath(path)) roots?.delete(root);
          return { ok: true, revoked: path };
        },
      },
    };
  }
}
