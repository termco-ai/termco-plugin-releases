/**
 * Shared LSP types: server configs, session keys, status shapes, and the
 * CodeMirror-language-id → LSP-language-id table. Dependency-free so both the
 * session manager and the renderer-facing command layer can import it.
 */
import type { WorkspaceEnv } from "@termco/workspace-base";

/** How a curated server gets onto the machine without the user touching npm. */
export type LspAutoInstall = {
  npmPackage: string;
  /** Exact version to pin the install dir to (`<pkg>@<version>`). */
  version: string;
  /** Bin name inside the package's `bin` map (defaults to the package name). */
  bin?: string;
  /** Extra packages installed alongside (e.g. typescript for the TS server). */
  extraPackages?: string[];
};

export type LspServerConfig = {
  id: string;
  /** Human-readable name for the settings UI. */
  name: string;
  /** CodeMirror language ids (languageResolver ids) this server handles. */
  languages: string[];
  /** Executable to spawn; for auto-installed servers resolved at spawn time. */
  command: string;
  args: string[];
  /** Files whose presence marks a project root, in priority order. */
  rootMarkers: string[];
  /**
   * Activation condition: the server only claims a file when one of these
   * files exists between the file's directory and the rig root. Servers
   * WITHOUT projectMarkers are generic fallbacks — a marker-matched server
   * wins the language over them (e.g. Angular's ngserver takes .html only in
   * projects with an angular.json).
   */
  projectMarkers?: string[];
  /**
   * "primary" (default) answers hover/definition/completions and there is at
   * most one per document. "secondary" servers (linter class: eslint,
   * tailwind) run IN ADDITION on the same document — their diagnostics merge
   * with the primary's and their completions join the popup.
   */
  role?: "primary" | "secondary";
  initializationOptions?: unknown;
  /** Sent via workspace/didChangeConfiguration + workspace/configuration. */
  settings?: unknown;
  autoInstall?: LspAutoInstall;
  enabled: boolean;
  /** True for user-defined servers (editable/removable in settings). */
  custom?: boolean;
};

/** User-editable part persisted to termco-lsp.json. */
export type LspUserConfig = {
  /** Per-curated-server overrides keyed by id. */
  overrides?: Record<
    string,
    Partial<Pick<LspServerConfig, "enabled" | "initializationOptions" | "settings" | "command" | "args">>
  >;
  /** Fully user-defined servers. */
  custom?: LspServerConfig[];
};

export type SessionState =
  | "starting"
  | "running"
  | "restarting"
  | "error"
  | "stopped";

export type SessionStatus = {
  sessionKey: string;
  serverId: string;
  scopeKey: string;
  root: string;
  state: SessionState;
  openDocs: number;
  pid?: number;
  lastError?: string;
};

export type LspDiagnostic = {
  range: LspRange;
  severity: number;
  message: string;
  source?: string;
  code?: string | number;
};

export type LspPosition = { line: number; character: number };
export type LspRange = { start: LspPosition; end: LspPosition };

export type DocChange = { range?: LspRange; text: string };

/** Main-side mirror of the renderer's workspaceScopeKey(). */
export function envScopeKey(ws: WorkspaceEnv): string {
  if (ws && ws.kind === "wsl") return `wsl:${ws.distro}`;
  if (ws && ws.kind === "ssh") return `ssh:${ws.connectionId}`;
  return "local";
}

export function sessionKeyOf(
  scopeKey: string,
  serverId: string,
  root: string,
): string {
  return `${scopeKey}\u0000${serverId}\u0000${root}`;
}

/**
 * CodeMirror language id (languageResolver's `id`, i.e. the primary file
 * extension) → LSP languageId as servers expect it in didOpen.
 */
const CM_TO_LSP_LANGUAGE: Record<string, string> = {
  ts: "typescript",
  tsx: "typescriptreact",
  js: "javascript",
  jsx: "javascriptreact",
  mjs: "javascript",
  cjs: "javascript",
  py: "python",
  json: "json",
  jsonc: "jsonc",
  css: "css",
  scss: "scss",
  less: "less",
  html: "html",
  rs: "rust",
  go: "go",
  vue: "vue",
  php: "php",
  md: "markdown",
};

export function lspLanguageId(cmLanguageId: string): string {
  return CM_TO_LSP_LANGUAGE[cmLanguageId] ?? cmLanguageId;
}

/**
 * Substitute launch-arg placeholders at spawn time (both transports):
 *  - `${root}` → detected project root
 *  - `${serverModules}` → node_modules of the MANAGED server install (falls
 *    back to `${root}/node_modules` for PATH/custom launches). Lets e.g.
 *    ngserver probe the project first and our bundled
 *    @angular/language-service+typescript as a fallback.
 */
export function substituteLaunchArgs(
  args: string[],
  vars: { root: string; serverModules?: string },
): string[] {
  const serverModules = vars.serverModules ?? `${vars.root}/node_modules`;
  return args.map((arg) =>
    arg
      .replaceAll("${root}", vars.root)
      .replaceAll("${serverModules}", serverModules),
  );
}

/** djb2 — cheap content checksum for didChange drift detection. Must match the
 * renderer's implementation in src/modules/editor/lib/lsp/checksum.ts. */
export function contentChecksum(text: string): number {
  let h = 5381;
  for (let i = 0; i < text.length; i++) {
    h = ((h << 5) + h + text.charCodeAt(i)) | 0;
  }
  return h >>> 0;
}
