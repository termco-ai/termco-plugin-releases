import type {
  AiToolContribution,
  AiToolDefinition,
} from "@termco/ai-tools-base";
import type { LspSessionsCapability } from "@termco/editor-base";
import type { WorkspaceEnv } from "@termco/workspace-base";

type Position = { line: number; character: number };
type Range = { start: Position; end: Position };
type Diagnostic = {
  range: Range;
  severity?: number;
  message: string;
  source?: string;
  code?: string | number;
};

const severity = ["error", "warning", "info", "hint"] as const;

function values(input: unknown): Record<string, unknown> {
  return input && typeof input === "object"
    ? (input as Record<string, unknown>)
    : {};
}

function resolvePath(path: string, cwd: string | null): string {
  if (path.startsWith("/") || /^[a-zA-Z]:[\\/]/.test(path)) return path;
  if (!cwd) throw new Error(`cannot resolve relative path "${path}": no active cwd`);
  const separator = cwd.includes("\\") && !cwd.includes("/") ? "\\" : "/";
  return cwd.endsWith(separator) ? `${cwd}${path}` : `${cwd}${separator}${path}`;
}

function formatted(diagnostics: readonly Diagnostic[], cap = 50) {
  return {
    diagnostics: diagnostics.slice(0, cap).map((diagnostic) => ({
      line: diagnostic.range.start.line + 1,
      column: diagnostic.range.start.character + 1,
      severity: severity[(diagnostic.severity ?? 3) - 1] ?? "info",
      message: diagnostic.message,
      source: diagnostic.source,
      code: diagnostic.code,
    })),
    ...(diagnostics.length > cap
      ? { truncated: diagnostics.length - cap }
      : {}),
  };
}

const positionSchema = {
  path: { type: "string", description: "Absolute path, or relative to the active cwd." },
  line: { type: "integer", minimum: 1, description: "1-based line." },
  column: { type: "integer", minimum: 1, description: "1-based column." },
};

export function createLspContribution(
  lsp: LspSessionsCapability,
): AiToolContribution {
  return {
    id: "lsp",
    group: "core",
    order: 130,
    build(runtime) {
      const workspace = (): WorkspaceEnv =>
        runtime.getWorkspaceEnv?.() ?? { kind: "local" };
      const invoke = (command: string, payload: Record<string, unknown>) =>
        lsp.invoke(command, payload, { senderWebContentsId: 0 });
      const diagnostics: AiToolDefinition = {
        description:
          "Get language-server diagnostics for one file, or cached diagnostics for all open files when path is omitted.",
        inputSchema: {
          type: "object",
          properties: { path: { type: "string" } },
          additionalProperties: false,
        },
        async execute(input) {
          try {
            const raw = values(input).path;
            const path = typeof raw === "string"
              ? resolvePath(raw, runtime.getCwd?.() ?? null)
              : undefined;
            const result = (await invoke("lsp_diagnostics", {
              workspace: workspace(),
              rigRoot: runtime.getRigRoot?.() ?? runtime.getWorkspaceRoot?.() ?? null,
              ...(path ? { path } : {}),
            })) as {
              diagnostics?: Diagnostic[];
              files?: Array<{ path: string; diagnostics: Diagnostic[] }>;
              error?: string;
            };
            if (result.error) return { error: result.error };
            if (result.files) {
              return {
                files: result.files.map((file) => ({
                  path: file.path,
                  ...formatted(file.diagnostics, 25),
                })),
              };
            }
            return formatted(result.diagnostics ?? []);
          } catch (error) {
            return { error: String(error) };
          }
        },
      };
      const definition: AiToolDefinition = {
        description:
          "Resolve the definition of a symbol at a precise source position.",
        inputSchema: {
          type: "object",
          properties: positionSchema,
          required: ["path", "line", "column"],
          additionalProperties: false,
        },
        async execute(input) {
          try {
            const value = values(input);
            const locations = (await invoke("lsp_definition", {
              workspace: workspace(),
              path: resolvePath(String(value.path ?? ""), runtime.getCwd?.() ?? null),
              position: {
                line: Number(value.line) - 1,
                character: Number(value.column) - 1,
              },
            })) as Array<{ path: string; line: number; character: number }>;
            return locations.length
              ? {
                  definitions: locations.map((location) => ({
                    path: location.path,
                    line: location.line + 1,
                    column: location.character + 1,
                  })),
                }
              : { error: "no definition found" };
          } catch (error) {
            return { error: String(error) };
          }
        },
      };
      const hover: AiToolDefinition = {
        description:
          "Get the type signature and documentation shown by the editor at a source position.",
        inputSchema: {
          type: "object",
          properties: positionSchema,
          required: ["path", "line", "column"],
          additionalProperties: false,
        },
        async execute(input) {
          try {
            const value = values(input);
            const result = (await invoke("lsp_hover", {
              workspace: workspace(),
              path: resolvePath(String(value.path ?? ""), runtime.getCwd?.() ?? null),
              position: {
                line: Number(value.line) - 1,
                character: Number(value.column) - 1,
              },
            })) as { markdown: string } | null;
            return result ? { info: result.markdown } : { error: "no hover info" };
          } catch (error) {
            return { error: String(error) };
          }
        },
      };
      return {
        lsp_diagnostics: diagnostics,
        lsp_definition: definition,
        lsp_hover: hover,
      };
    },
  };
}
