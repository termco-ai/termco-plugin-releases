/**
 * Project-aware document formatting. Detection walks from the file toward the
 * rig root for formatter configs (nearest level wins; biome > prettier >
 * dprint on a tie), runs the PROJECT'S own binary (node_modules/.bin first,
 * then the login-shell PATH) with the buffer on stdin, and falls back to the
 * primary LSP session's textDocument/formatting when no config exists (gopls,
 * rust-analyzer, the css/json/html servers, tsserver defaults).
 *
 * Fail-open by design: any error skips formatting — a save must never block.
 */
import { spawn } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import type * as lsp from "vscode-languageserver-protocol";
import type { WorkspaceEnv } from "@termco/workspace-base";
import { lspRuntime } from "./runtime";
import { offsetAt } from "./session";
import type { SessionManager } from "./sessions";
import { userShellPath, whichOnUserPath } from "./userPath";

export type FormatterKind =
  | "biome"
  | "prettier"
  | "dprint"
  | "ruff"
  | "black"
  | "clang-format"
  | "shfmt";

type FormatterSpec = {
  kind: FormatterKind;
  configs: string[];
  /** Config that lives INSIDE a shared file (pyproject.toml sections). */
  configContent?: { file: string; needle: string };
  bin: string;
  args: (filePath: string) => string[];
  /** File extensions this tool formats even WITHOUT a config — used only
   * when the binary is actually present (project venv/bin or PATH). */
  defaultFor?: string[];
};

/** Priority order on a same-directory tie. */
export const FORMATTERS: FormatterSpec[] = [
  {
    kind: "biome",
    configs: ["biome.json", "biome.jsonc"],
    bin: "biome",
    args: (filePath) => ["format", `--stdin-file-path=${filePath}`],
  },
  {
    kind: "prettier",
    configs: [
      ".prettierrc",
      ".prettierrc.json",
      ".prettierrc.yml",
      ".prettierrc.yaml",
      ".prettierrc.js",
      ".prettierrc.cjs",
      ".prettierrc.mjs",
      ".prettierrc.toml",
      "prettier.config.js",
      "prettier.config.cjs",
      "prettier.config.mjs",
    ],
    bin: "prettier",
    args: (filePath) => ["--stdin-filepath", filePath],
  },
  {
    kind: "dprint",
    configs: ["dprint.json", ".dprint.json", "dprint.jsonc"],
    bin: "dprint",
    args: (filePath) => ["fmt", "--stdin", filePath],
  },
  {
    kind: "ruff",
    configs: ["ruff.toml", ".ruff.toml"],
    configContent: { file: "pyproject.toml", needle: "[tool.ruff" },
    bin: "ruff",
    args: (filePath) => ["format", "--stdin-filename", filePath, "-"],
    defaultFor: ["py"],
  },
  {
    kind: "black",
    configs: [],
    configContent: { file: "pyproject.toml", needle: "[tool.black" },
    bin: "black",
    args: (filePath) => ["--quiet", "--stdin-filename", filePath, "-"],
    defaultFor: ["py"],
  },
  {
    kind: "clang-format",
    configs: [".clang-format", "_clang-format"],
    bin: "clang-format",
    args: (filePath) => [`--assume-filename=${filePath}`],
  },
  {
    // shfmt has no config file of its own (.editorconfig drives it) —
    // presence-based only.
    kind: "shfmt",
    configs: [],
    bin: "shfmt",
    args: (filePath) => ["-filename", filePath],
    defaultFor: ["sh", "bash", "zsh"],
  },
];

function fileExtension(path: string): string {
  const base = path.slice(path.lastIndexOf("/") + 1);
  const dot = base.lastIndexOf(".");
  return dot > 0 ? base.slice(dot + 1).toLowerCase() : "";
}

export type DetectedFormatter = { spec: FormatterSpec; configDir: string };

/** Nearest directory (file → rigRoot) containing any formatter config;
 * FORMATTERS order breaks ties within one directory. */
export function detectFormatterLocal(
  filePath: string,
  rigRoot: string | null,
): DetectedFormatter | null {
  let dir = dirname(filePath);
  for (;;) {
    for (const spec of FORMATTERS) {
      if (spec.configs.some((c) => existsSync(join(dir, c)))) {
        return { spec, configDir: dir };
      }
      const content = spec.configContent;
      if (content) {
        const shared = join(dir, content.file);
        if (existsSync(shared)) {
          try {
            if (readFileSync(shared, "utf8").includes(content.needle)) {
              return { spec, configDir: dir };
            }
          } catch {
            // unreadable shared config — treat as absent
          }
        }
      }
    }
    if (rigRoot && dir === rigRoot) break;
    const parent = dirname(dir);
    if (parent === dir) break;
    if (rigRoot && !dir.startsWith(rigRoot)) break;
    dir = parent;
  }
  return null;
}

const PROJECT_BIN_DIRS = [
  join("node_modules", ".bin"),
  join(".venv", "bin"),
  join("venv", "bin"),
];

/** Nearest project-local binary (node_modules/.bin, .venv/bin, venv/bin)
 * between the file and the rig root. */
export function resolveProjectBinLocal(
  filePath: string,
  bin: string,
  rigRoot: string | null,
): string | null {
  let dir = dirname(filePath);
  for (;;) {
    for (const binDir of PROJECT_BIN_DIRS) {
      const candidate = join(dir, binDir, bin);
      if (existsSync(candidate)) return candidate;
    }
    if (rigRoot && dir === rigRoot) break;
    const parent = dirname(dir);
    if (parent === dir) break;
    if (rigRoot && !dir.startsWith(rigRoot)) break;
    dir = parent;
  }
  return null;
}

/** Apply LSP TextEdits to a snapshot (non-overlapping per spec; applied
 * bottom-up so earlier offsets stay valid). */
export function applyTextEdits(text: string, edits: lsp.TextEdit[]): string {
  const sorted = [...edits].sort((a, b) => {
    const lineDiff = b.range.start.line - a.range.start.line;
    return lineDiff !== 0
      ? lineDiff
      : b.range.start.character - a.range.start.character;
  });
  let out = text;
  for (const edit of sorted) {
    const start = offsetAt(out, edit.range.start.line, edit.range.start.character);
    const end = offsetAt(out, edit.range.end.line, edit.range.end.character);
    out = out.slice(0, start) + edit.newText + out.slice(end);
  }
  return out;
}

const CLI_TIMEOUT_MS = 15_000;
const MAX_OUTPUT_BYTES = 16 * 1024 * 1024;

type SshWorkspace = Extract<NonNullable<WorkspaceEnv>, { kind: "ssh" }>;

const isSshWorkspace = (workspace: WorkspaceEnv): workspace is SshWorkspace =>
  Boolean(workspace && workspace.kind === "ssh");

/** Formatters compare the stdin path against their project config — absolute
 * paths silently miss on macOS (`/var` vs `/private/var` symlink), so we run
 * with cwd = config dir and a RELATIVE stdin path. */
export function stdinPathFor(configDir: string, filePath: string): string {
  const rel = relative(configDir, filePath);
  return rel && !rel.startsWith("..") ? rel : filePath;
}

/** Run a formatter CLI locally: buffer on stdin, formatted text on stdout.
 * PATH is the login-shell PATH so `#!/usr/bin/env node` shims resolve. */
async function runCliLocal(
  command: string,
  args: string[],
  cwd: string,
  text: string,
): Promise<{ formatted: string } | { error: string }> {
  const path = await userShellPath();
  return new Promise((resolve) => {
    const child = spawn(command, args, {
      cwd,
      stdio: ["pipe", "pipe", "pipe"],
      env: { ...process.env, PATH: path },
      timeout: CLI_TIMEOUT_MS,
    });
    const out: Buffer[] = [];
    let outBytes = 0;
    let stderrTail = "";
    child.stdout.on("data", (c: Buffer) => {
      outBytes += c.length;
      if (outBytes <= MAX_OUTPUT_BYTES) out.push(c);
    });
    child.stderr.on("data", (c: Buffer) => {
      stderrTail = (stderrTail + c.toString("utf8")).slice(-600);
    });
    child.on("error", (e) => resolve({ error: String(e) }));
    child.on("close", (code) => {
      if (code === 0 && out.length > 0) {
        resolve({ formatted: Buffer.concat(out).toString("utf8") });
      } else {
        resolve({ error: stderrTail.trim() || `formatter exited ${code}` });
      }
    });
    child.stdin.on("error", () => {});
    child.stdin.end(text);
  });
}

/** Remote variant: config detection + bin resolution + run via the agent.
 * Config lookup uses lsp.findRoot (outermost within the rig root — a
 * documented approximation of "nearest"; identical in practice outside
 * multi-config monorepos). */
async function formatViaRemoteCli(
  ws: WorkspaceEnv,
  rigRoot: string | null,
  path: string,
  text: string,
): Promise<{ formatted: string; formatter: FormatterKind } | null> {
  const { execution } = lspRuntime();
  const call = <T>(domain: string, method: string, params: unknown) =>
    execution.invoke<T>(ws, { domain, method, args: [params] });
  for (const spec of FORMATTERS) {
    const found = await call<{ root: string | null }>("lsp", "findRoot", {
      path,
      markers: spec.configs,
      stopAt: rigRoot,
    });
    if (!found.root) continue;
    const candidates = [
      join(found.root, "node_modules", ".bin", spec.bin),
      ...(rigRoot && rigRoot !== found.root
        ? [join(rigRoot, "node_modules", ".bin", spec.bin)]
        : []),
    ];
    const exists = await call<{ found: string[] }>("fmt", "exists", {
      paths: candidates,
    });
    let command: string | null = exists.found[0] ?? null;
    if (!command) {
      const which = await call<{
        found: Record<string, string | null>;
      }>("lsp", "which", { bins: [spec.bin] });
      command = which.found[spec.bin];
    }
    if (!command) return null; // config found but tool missing — skip, no LSP fallback surprise
    const result = await call<{
      ok: boolean;
      stdoutB64?: string;
      error?: string;
    }>("fmt", "run", {
      command,
      args: spec.args(
        path.startsWith(`${found.root}/`)
          ? path.slice(found.root.length + 1)
          : path,
      ),
      cwd: found.root,
      stdinB64: Buffer.from(text, "utf8").toString("base64"),
    });
    if (!result.ok || !result.stdoutB64) return null;
    return {
      formatted: Buffer.from(result.stdoutB64, "base64").toString("utf8"),
      formatter: spec.kind,
    };
  }
  return null;
}

/**
 * Presence-based defaults: no config anywhere, but the file's language has a
 * canonical formatter (ruff/black for Python, shfmt for shell) AND the binary
 * exists in the project (venv) or on the PATH → use it.
 */
async function defaultFormatterLocal(
  filePath: string,
  rigRoot: string | null,
): Promise<{ spec: FormatterSpec; configDir: string; command: string } | null> {
  const ext = fileExtension(filePath);
  for (const spec of FORMATTERS) {
    if (!spec.defaultFor?.includes(ext)) continue;
    const command =
      resolveProjectBinLocal(filePath, spec.bin, rigRoot) ??
      (await whichOnUserPath(spec.bin));
    if (command) {
      return { spec, configDir: rigRoot ?? dirname(filePath), command };
    }
  }
  return null;
}

export type FormatResult =
  | { formatted: string; formatter: string }
  | { formatted: null; reason: string };

/**
 * Format `text` as it would be saved at `path`: project CLI first, LSP
 * formatting as the fallback. Never throws.
 */
export async function formatDocument(
  manager: SessionManager,
  ws: WorkspaceEnv,
  rigRoot: string | null,
  path: string,
  text: string,
): Promise<FormatResult> {
  try {
    if (isSshWorkspace(ws)) {
      const remote = await formatViaRemoteCli(ws, rigRoot, path, text);
      if (remote) return remote;
    } else {
      const detected = detectFormatterLocal(path, rigRoot);
      if (detected) {
        const command =
          resolveProjectBinLocal(path, detected.spec.bin, rigRoot) ??
          (await whichOnUserPath(detected.spec.bin));
        if (!command) {
          return {
            formatted: null,
            reason: `${detected.spec.kind} config found but the binary is not installed`,
          };
        }
        const result = await runCliLocal(
          command,
          detected.spec.args(stdinPathFor(detected.configDir, path)),
          detected.configDir,
          text,
        );
        if ("formatted" in result) {
          return { formatted: result.formatted, formatter: detected.spec.kind };
        }
        return { formatted: null, reason: result.error };
      }
      // No config — presence-based language default (ruff/black/shfmt).
      const fallbackTool = await defaultFormatterLocal(path, rigRoot);
      if (fallbackTool) {
        const result = await runCliLocal(
          fallbackTool.command,
          fallbackTool.spec.args(stdinPathFor(fallbackTool.configDir, path)),
          fallbackTool.configDir,
          text,
        );
        if ("formatted" in result) {
          return {
            formatted: result.formatted,
            formatter: fallbackTool.spec.kind,
          };
        }
        return { formatted: null, reason: result.error };
      }
    }
    // No project formatter — ask the primary LSP session (gopls/rust-analyzer/
    // css/json/html format well; tsserver formats with its own defaults).
    const viaLsp = await manager.formatViaLsp(ws, path);
    if (viaLsp != null && viaLsp !== text) {
      return { formatted: viaLsp, formatter: "lsp" };
    }
    return { formatted: null, reason: "no formatter available" };
  } catch (e) {
    return { formatted: null, reason: String(e) };
  }
}
