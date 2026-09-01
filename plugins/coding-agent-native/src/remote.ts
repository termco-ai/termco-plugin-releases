/**
 * Remote (SSH) execution for the coding-agent driver. When a run's rig is an
 * SSH connection, we run the backend CLI on the remote host and stream its NDJSON
 * back — reusing the same `ssh <target> "<remote command>"` one-shot pattern as
 * the shared `ssh.client` provider (including its live connection pool).
 *
 * The remote command MUST be a single string: ssh re-joins everything after the
 * destination with spaces and hands it to the remote login shell verbatim, so we
 * shell-quote each argv element ourselves (unlike local `spawn`, which passes
 * argv directly). The single-quote-escape idiom matches `shellInit.ts`.
 */

import type { AgentWorkspace } from "@termco/agents-base";
import type { SshTarget } from "@termco/ssh-base";
import { codingAgentRuntime } from "./runtime";

export const REMOTE_PATH_PRELUDE =
  'PATH="$HOME/.local/bin:$HOME/.claude/local:$HOME/bin:$HOME/.npm-global/bin:/usr/local/bin:$PATH"; ' +
  'for d in "$HOME"/.nvm/versions/node/*/bin; do [ -d "$d" ] && PATH="$d:$PATH"; done; ' +
  "export PATH; ";

type SshWorkspace = Extract<AgentWorkspace, { kind: "ssh" }>;

/** Build the runner's `SshTarget` from an ssh workspace (fields line up 1:1). */
export function targetFromWorkspace(ws: SshWorkspace): SshTarget {
  return { connectionId: ws.connectionId, host: ws.host, user: ws.user, port: ws.port };
}

/** POSIX single-quote a shell argument so it survives remote re-parsing. */
export function shellQuote(arg: string): string {
  return `'${arg.replace(/'/g, "'\\''")}'`;
}

/** The stdin token prelude: read the first stdin line into `TERMCO_MCP_TOKEN`
 * and export it, BEFORE exec. The token thus never appears in argv (visible in
 * remote `ps` on multi-user hosts) nor in an inline `VAR=x` (which becomes
 * `sh -c` argv). The driver writes `<token>\n` as the first bytes to stdin. */
export const REMOTE_TOKEN_PRELUDE =
  "IFS= read -r TERMCO_MCP_TOKEN; export TERMCO_MCP_TOKEN; ";

/** Env-var names safe to inline into the remote command line. */
const SAFE_ENV_KEY = /^[A-Za-z_][A-Za-z0-9_]*$/;

/** Inline NON-SECRET env exports for the exec'd remote command
 * (`export IS_SANDBOX='1'; export MAX_THINKING_TOKENS='12000'; exec …`).
 * Env doesn't cross ssh, so anything the adapter needs remotely must ride in
 * the command — fine for these flags (visible in remote `ps`, which is why
 * the TOKEN never goes this way: it uses the stdin prelude). `VAR='v' exec …`
 * exports for the exec'd process across POSIX shells. */
export function inlineEnvPrefix(env: Record<string, string> | undefined): string {
  if (!env) return "";
  const parts = Object.entries(env)
    .filter(([k]) => SAFE_ENV_KEY.test(k))
    .map(([k, v]) => `${k}=${shellQuote(v)}`);
  return parts.length ? `${parts.join(" ")} ` : "";
}

/** `cd '<cwd>'; exec <bin> <quoted args…>` — the remote command line, prefixed
 * with the PATH prelude so user-local CLI installs resolve. cwd errors are
 * swallowed (falls back to the remote home), matching the ssh terminal.
 * `withToken` prepends the stdin-token prelude (ssh MCP runs); `env` inlines
 * non-secret adapter env vars for the exec'd process. */
export function buildRemoteCommand(
  bin: string,
  args: string[],
  cwd: string,
  withToken = false,
  env?: Record<string, string>,
): string {
  const quoted = [bin, ...args].map(shellQuote).join(" ");
  const cd = cwd ? `cd ${shellQuote(cwd)} 2>/dev/null; ` : "";
  const tokenPrelude = withToken ? REMOTE_TOKEN_PRELUDE : "";
  return `${tokenPrelude}${REMOTE_PATH_PRELUDE}${cd}${inlineEnvPrefix(env)}exec ${quoted}`;
}

/** Full `ssh` argv to run `<bin> <args>` in `cwd` on the workspace's host.
 * `extraOpts` are ssh options placed before the destination (e.g. a `-R`
 * reverse tunnel so the remote can reach our local approval server).
 * `withToken` wraps the remote command to read the MCP token from stdin;
 * `env` inlines non-secret adapter env vars. */
export function sshSpawnArgs(
  ws: SshWorkspace,
  bin: string,
  args: string[],
  cwd: string,
  extraOpts: string[] = [],
  withToken = false,
  env?: Record<string, string>,
): string[] {
  return codingAgentRuntime().execution.prepare<string[]>(ws, {
    domain: "ssh",
    method: "sshArgs",
    args: [[buildRemoteCommand(bin, args, cwd, withToken, env)], extraOpts],
  });
}

/** ssh `-R` reverse-forward opts so the remote's 127.0.0.1:<port> reaches our
 * local approval server at the same port (empty when there's no endpoint). */
export function reverseTunnelOpts(approvalEndpoint: string | undefined): string[] {
  const port = portFromEndpoint(approvalEndpoint);
  return port ? ["-R", `${port}:127.0.0.1:${port}`] : [];
}

/** ssh `-R` reverse-forward for the MCP control server — same-port both ends
 * so the URL injected into the CLI (`http://127.0.0.1:<port>/mcp`) resolves on
 * the remote unchanged (mirrors the approval tunnel). Empty when no MCP URL. */
export function mcpReverseTunnelOpts(mcpUrl: string | undefined): string[] {
  const port = portFromEndpoint(mcpUrl);
  return port ? ["-R", `${port}:127.0.0.1:${port}`] : [];
}

/** Extract the port from `http://127.0.0.1:<port>`, or "" if none. */
export function portFromEndpoint(endpoint: string | undefined): string {
  if (!endpoint) return "";
  try {
    return new URL(endpoint).port;
  } catch {
    return "";
  }
}

/** The `command -v <bin>` remote availability probe command (mirrors
 * `ssh/probe.ts`); run it via `runSsh(target, …)` and check for the marker.
 * Uses the same PATH prelude as the spawn — probe and spawn MUST agree on
 * where they look, or the roster shows a backend the spawn can't find. */
export const REMOTE_PROBE_MARKER = "TCOK";
export function remoteProbeCommand(bin: string): string {
  return `${REMOTE_PATH_PRELUDE}command -v ${shellQuote(bin)} >/dev/null 2>&1 && echo ${REMOTE_PROBE_MARKER}`;
}
// Owned by the coding-agent-native provider plugin.
