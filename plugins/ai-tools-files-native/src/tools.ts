import type {
  AiToolContribution,
  AiToolDefinition,
  AiToolFileMutation,
  AiToolRuntime,
} from "@termco/ai-tools-base";
import type { WorkspaceFilesCapability } from "@termco/files-base";
import type { WorkspaceEnv } from "@termco/workspace-base";
import { checkReadableCanonical, checkWritableCanonical } from "./security";

const EMPTY = { type: "object", properties: {}, additionalProperties: false };
const PATH = { type: "string", description: "Absolute path, or relative to the active terminal directory." };
const READ_BYTE_CAP = 25 * 1024;
const READ_LINE_CAP = 2000;
const fallbackCaches = new WeakMap<AiToolRuntime, Map<string, { size: number; hash: number }>>();

type ReadResult =
  | { kind: "text"; content: string; size: number }
  | { kind: "binary"; size: number }
  | { kind: "toolarge"; size: number; limit?: number }
  | { kind: "missing" };

function values(input: unknown): Record<string, unknown> {
  return input && typeof input === "object" ? input as Record<string, unknown> : {};
}

function definition(
  description: string,
  inputSchema: Record<string, unknown>,
  execute: (input: Record<string, unknown>) => unknown | Promise<unknown>,
  needsApproval = false,
): AiToolDefinition {
  return { description, inputSchema, execute: (input) => execute(values(input)), ...(needsApproval ? { needsApproval: true } : {}) };
}

function environment(runtime: AiToolRuntime): WorkspaceEnv {
  return runtime.getWorkspaceEnv?.() ?? { kind: "local" };
}

function resolvePath(path: string, runtime: AiToolRuntime): string {
  if (path.startsWith("/") || /^[a-zA-Z]:[\\/]/.test(path)) return path;
  const cwd = runtime.getCwd?.();
  if (!cwd) throw new Error(`cannot resolve relative path "${path}": no active terminal cwd. Pass an absolute path.`);
  const separator = cwd.includes("\\") && !cwd.includes("/") ? "\\" : "/";
  return cwd.endsWith(separator) ? `${cwd}${path}` : `${cwd}${separator}${path}`;
}

function cache(runtime: AiToolRuntime): Map<string, { size: number; hash: number }> {
  if (runtime.readCache) return runtime.readCache;
  let value = fallbackCaches.get(runtime);
  if (!value) { value = new Map(); fallbackCaches.set(runtime, value); }
  return value;
}

function djb2(text: string): number {
  let hash = 5381;
  for (let index = 0; index < text.length; index++) hash = ((hash << 5) + hash + text.charCodeAt(index)) | 0;
  return hash >>> 0;
}

function queue(runtime: AiToolRuntime, mutation: AiToolFileMutation): boolean {
  if (!runtime.isPlanMode?.()) return false;
  if (!runtime.queueFileMutation) throw new Error("plan mode is active but its file-review queue is unavailable");
  runtime.queueFileMutation(mutation);
  return true;
}

function clipLine(text: string): string {
  return text.length <= 160 ? text : `${text.slice(0, 160)}…[+${text.length - 160}]`;
}

function searchRoot(raw: unknown, runtime: AiToolRuntime): { ok: true; path: string } | { ok: false; error: string } {
  if (typeof raw === "string" && raw.trim()) {
    try { return { ok: true, path: resolvePath(raw, runtime) }; }
    catch (error) { return { ok: false, error: String(error) }; }
  }
  const root = runtime.getWorkspaceRoot?.() ?? runtime.getCwd?.();
  return root ? { ok: true, path: root } : { ok: false, error: "no workspace root or active cwd; pass `root` explicitly." };
}

export class FileToolSet {
  constructor(private readonly files: WorkspaceFilesCapability) {}

  contributions(): AiToolContribution[] {
    return [
      { id: "fs", group: "files", order: 10, build: (runtime) => this.fsTools(runtime) },
      { id: "edit", group: "files", order: 20, build: (runtime) => this.editTools(runtime) },
      { id: "search", group: "files", order: 30, build: (runtime) => this.searchTools(runtime) },
    ];
  }

  private canonicalize(runtime: AiToolRuntime): (path: string) => Promise<string> {
    return (path) => this.files.canonicalize(path, environment(runtime));
  }

  fsTools(runtime: AiToolRuntime): Record<string, AiToolDefinition> {
    return {
      read_file: definition(
        "Read a UTF-8 text file, with line windowing and a 25KB response cap. Refuses binary, oversized, and sensitive files. An unchanged repeat read returns only unchanged=true.",
        { type: "object", properties: { path: PATH, offset: { type: "integer", minimum: 0 }, limit: { type: "integer", minimum: 1, maximum: 10000 } }, required: ["path"], additionalProperties: false },
        async ({ path, offset, limit }) => {
          let requested: string;
          try { requested = resolvePath(String(path ?? ""), runtime); }
          catch (error) { return { error: String(error), path }; }
          const safety = await checkReadableCanonical(requested, this.canonicalize(runtime));
          if (!safety.ok) return { error: safety.reason, path: requested };
          const absolute = safety.canonical;
          try {
            const result = await this.files.readFile(absolute, environment(runtime)) as ReadResult;
            if (result.kind === "binary") return { error: "binary file refused", path: absolute, size: result.size };
            if (result.kind === "toolarge") return { error: `file too large (${result.size} bytes, limit ${result.limit ?? "provider"})`, path: absolute };
            if (result.kind === "missing") return { error: "file not found", path: absolute };
            const sessionCache = cache(runtime);
            const hash = djb2(result.content);
            const full = offset === undefined && limit === undefined;
            const prior = sessionCache.get(absolute);
            if (full && prior?.size === result.size && prior.hash === hash) return { path: absolute, unchanged: true, size: result.size };
            sessionCache.set(absolute, { size: result.size, hash });
            const lines = result.content.split("\n");
            const start = full ? 0 : Number(offset ?? 0);
            const count = full ? READ_LINE_CAP : Number(limit ?? READ_LINE_CAP);
            const end = Math.min(lines.length, start + count);
            let content = lines.slice(start, end).join("\n");
            let truncated = end < lines.length;
            if (content.length > READ_BYTE_CAP) { content = content.slice(0, READ_BYTE_CAP); truncated = true; }
            return {
              path: absolute,
              content,
              size: result.size,
              total_lines: lines.length,
              ...(full ? {} : { start_line: start, end_line: end }),
              ...(truncated ? { truncated: true, ...(full ? { hint: "call read_file with offset to continue" } : {}) } : {}),
            };
          } catch (error) { return { error: String(error), path: absolute }; }
        },
      ),
      list_directory: definition(
        "List immediate non-hidden files and directories. Use glob for recursive discovery.",
        { type: "object", properties: { path: PATH }, required: ["path"], additionalProperties: false },
        async ({ path }) => this.withReadable(runtime, path, async (absolute) => ({
          path: absolute,
          entries: (await this.files.readDir(absolute, false, false, environment(runtime))).map(({ name, kind }) => ({ name, kind })),
        })),
      ),
      write_file: definition(
        "Create or overwrite a file. Prefer exact edit tools for existing files. Always asks for approval.",
        { type: "object", properties: { path: PATH, content: { type: "string" } }, required: ["path", "content"], additionalProperties: false },
        async ({ path, content }) => {
          const prepared = await this.writable(runtime, path);
          if (!prepared.ok) return prepared.result;
          const text = String(content ?? "");
          if (runtime.isPlanMode?.()) {
            let original = "";
            let isNewFile = true;
            try {
              const existing = await this.files.readFile(prepared.path, environment(runtime), true) as ReadResult;
              if (existing.kind === "text") { original = existing.content; isNewFile = false; }
            } catch { /* provider reports a new file during the eventual write */ }
            try {
              queue(runtime, { kind: "write_file", path: prepared.path, originalContent: original, proposedContent: text, isNewFile });
              return { path: prepared.path, queued_for_plan_review: true, ok: true };
            } catch (error) { return { error: String(error), path: prepared.path }; }
          }
          try {
            await this.files.writeFile(prepared.path, text, environment(runtime), "ai-tools-files-native");
            cache(runtime).set(prepared.path, { size: text.length, hash: djb2(text) });
            return { path: prepared.path, bytesWritten: text.length, ok: true };
          } catch (error) { return { error: String(error), path: prepared.path }; }
        },
        true,
      ),
      create_directory: definition(
        "Create a directory and missing parents. Always asks for approval.",
        { type: "object", properties: { path: PATH }, required: ["path"], additionalProperties: false },
        async ({ path }) => {
          const prepared = await this.writable(runtime, path);
          if (!prepared.ok) return prepared.result;
          if (runtime.isPlanMode?.()) {
            try {
              queue(runtime, { kind: "create_directory", path: prepared.path, originalContent: "", proposedContent: "", isNewFile: true, description: "Create directory" });
              return { path: prepared.path, queued_for_plan_review: true, ok: true };
            } catch (error) { return { error: String(error), path: prepared.path }; }
          }
          try { await this.files.createDir(prepared.path, environment(runtime)); return { path: prepared.path, ok: true }; }
          catch (error) { return { error: String(error), path: prepared.path }; }
        },
        true,
      ),
      file_info: definition(
        "Return size, modification time, and file/directory/symlink kind without reading contents.",
        { type: "object", properties: { path: PATH }, required: ["path"], additionalProperties: false },
        async ({ path }) => this.withReadable(runtime, path, async (absolute) => ({ path: absolute, ...(await this.files.stat(absolute, environment(runtime)) as object) })),
      ),
      move: definition(
        "Move or rename a file or directory through the shared workspace provider. Always asks for approval.",
        { type: "object", properties: { from: PATH, to: PATH }, required: ["from", "to"], additionalProperties: false },
        async ({ from, to }) => {
          const source = await this.writable(runtime, from);
          if (!source.ok) return source.result;
          const destination = await this.writable(runtime, to);
          if (!destination.ok) return destination.result;
          try {
            await this.files.rename(source.path, destination.path, environment(runtime));
            cache(runtime).delete(source.path);
            return { ok: true, from: source.path, to: destination.path };
          } catch (error) { return { error: String(error), from: source.path, to: destination.path }; }
        },
        true,
      ),
      copy: definition(
        "Copy files or directories into a destination directory. Always asks for approval.",
        { type: "object", properties: { sources: { type: "array", minItems: 1, items: PATH }, destDir: PATH }, required: ["sources", "destDir"], additionalProperties: false },
        async ({ sources, destDir }) => {
          const destination = await this.writable(runtime, destDir);
          if (!destination.ok) return destination.result;
          const absolute: string[] = [];
          for (const source of Array.isArray(sources) ? sources : []) {
            const prepared = await this.readable(runtime, source);
            if (!prepared.ok) return prepared.result;
            absolute.push(prepared.path);
          }
          try { await this.files.copy(absolute, destination.path, environment(runtime)); return { ok: true, copied: absolute, destDir: destination.path }; }
          catch (error) {
            const message = String(error);
            return { error: /exist/i.test(message) ? `${message} — choose a different destination or remove the existing entry first.` : message, destDir: destination.path };
          }
        },
        true,
      ),
      delete: definition(
        "Recursively delete a file or directory. Destructive and always approval-gated.",
        { type: "object", properties: { path: PATH }, required: ["path"], additionalProperties: false },
        async ({ path }) => {
          const prepared = await this.writable(runtime, path);
          if (!prepared.ok) return prepared.result;
          try { await this.files.delete(prepared.path, environment(runtime)); cache(runtime).delete(prepared.path); return { ok: true, deleted: prepared.path }; }
          catch (error) { return { error: String(error), path: prepared.path }; }
        },
        true,
      ),
    };
  }

  editTools(runtime: AiToolRuntime): Record<string, AiToolDefinition> {
    const editSchema = {
      type: "object",
      properties: { old_string: { type: "string" }, new_string: { type: "string" }, replace_all: { type: "boolean" } },
      required: ["old_string", "new_string"],
      additionalProperties: false,
    };
    return {
      edit: definition(
        "Replace one exact string in a previously read file. The match must be unique unless replace_all is true. Always asks for approval.",
        { type: "object", properties: { path: PATH, ...editSchema.properties }, required: ["path", "old_string", "new_string"], additionalProperties: false },
        async ({ path, old_string, new_string, replace_all }) => this.edit(runtime, path, [{ old_string: String(old_string ?? ""), new_string: String(new_string ?? ""), replace_all: replace_all === true }], "edit"),
        true,
      ),
      multi_edit: definition(
        "Atomically apply ordered exact-string replacements to one previously read file. Any missing or ambiguous match aborts the batch. Always asks for approval.",
        { type: "object", properties: { path: PATH, edits: { type: "array", minItems: 1, items: editSchema } }, required: ["path", "edits"], additionalProperties: false },
        async ({ path, edits }) => this.edit(runtime, path, (Array.isArray(edits) ? edits : []).map((entry) => {
          const value = values(entry);
          return { old_string: String(value.old_string ?? ""), new_string: String(value.new_string ?? ""), replace_all: value.replace_all === true };
        }), "multi_edit"),
        true,
      ),
    };
  }

  searchTools(runtime: AiToolRuntime): Record<string, AiToolDefinition> {
    return {
      grep: definition(
        "Search file contents with a regular expression, honoring gitignore. Returns clipped path/line/text matches.",
        { type: "object", properties: { pattern: { type: "string" }, root: PATH, glob: { type: "array", items: { type: "string" } }, case_insensitive: { type: "boolean" }, max_results: { type: "integer", minimum: 1, maximum: 500 } }, required: ["pattern"], additionalProperties: false },
        async ({ pattern, root, glob, case_insensitive, max_results }) => {
          const prepared = await this.searchRoot(runtime, root);
          if (!prepared.ok) return prepared.result;
          try {
            const result = await this.files.grep({ pattern: String(pattern ?? ""), root: prepared.path, glob: Array.isArray(glob) ? glob.map(String) : undefined, caseInsensitive: case_insensitive === true, maxResults: typeof max_results === "number" ? Math.min(max_results, 500) : 30 }, environment(runtime)) as { hits?: Array<{ path: string; rel?: string; line: number; text: string }>; truncated?: boolean; files_scanned?: number };
            return { root: prepared.path, hits: (result.hits ?? []).map((hit) => ({ ...hit, text: clipLine(hit.text) })), truncated: result.truncated ?? false, files_scanned: result.files_scanned };
          } catch (error) { return { error: String(error), root: prepared.path }; }
        },
      ),
      glob: definition(
        "Find files recursively by gitignore-aware glob pattern, such as **/*.ts.",
        { type: "object", properties: { pattern: { type: "string" }, root: PATH, max_results: { type: "integer", minimum: 1, maximum: 2000 } }, required: ["pattern"], additionalProperties: false },
        async ({ pattern, root, max_results }) => {
          const prepared = await this.searchRoot(runtime, root);
          if (!prepared.ok) return prepared.result;
          try {
            const result = await this.files.glob({ pattern: String(pattern ?? ""), root: prepared.path, maxResults: typeof max_results === "number" ? max_results : undefined }, environment(runtime)) as { hits?: unknown[]; truncated?: boolean };
            return { root: prepared.path, hits: result.hits ?? [], truncated: result.truncated ?? false };
          } catch (error) { return { error: String(error), root: prepared.path }; }
        },
      ),
    };
  }

  private async readable(runtime: AiToolRuntime, path: unknown): Promise<{ ok: true; path: string } | { ok: false; result: object }> {
    let requested: string;
    try { requested = resolvePath(String(path ?? ""), runtime); }
    catch (error) { return { ok: false, result: { error: String(error), path } }; }
    const safety = await checkReadableCanonical(requested, this.canonicalize(runtime));
    return safety.ok ? { ok: true, path: safety.canonical } : { ok: false, result: { error: safety.reason, path: requested } };
  }

  private async writable(runtime: AiToolRuntime, path: unknown): Promise<{ ok: true; path: string } | { ok: false; result: object }> {
    let requested: string;
    try { requested = resolvePath(String(path ?? ""), runtime); }
    catch (error) { return { ok: false, result: { error: String(error), path } }; }
    const safety = await checkWritableCanonical(requested, this.canonicalize(runtime));
    return safety.ok ? { ok: true, path: safety.canonical } : { ok: false, result: { error: safety.reason, path: requested } };
  }

  private async withReadable(runtime: AiToolRuntime, path: unknown, action: (absolute: string) => Promise<unknown>): Promise<unknown> {
    const prepared = await this.readable(runtime, path);
    if (!prepared.ok) return prepared.result;
    try { return await action(prepared.path); }
    catch (error) { return { error: String(error), path: prepared.path }; }
  }

  private async searchRoot(runtime: AiToolRuntime, root: unknown): Promise<{ ok: true; path: string } | { ok: false; result: object }> {
    const resolved = searchRoot(root, runtime);
    if (!resolved.ok) return { ok: false, result: { error: resolved.error } };
    const safety = await checkReadableCanonical(resolved.path, this.canonicalize(runtime));
    return safety.ok ? { ok: true, path: safety.canonical } : { ok: false, result: { error: safety.reason, root: resolved.path } };
  }

  private async edit(runtime: AiToolRuntime, path: unknown, edits: Array<{ old_string: string; new_string: string; replace_all: boolean }>, kind: "edit" | "multi_edit"): Promise<unknown> {
    const prepared = await this.writable(runtime, path);
    if (!prepared.ok) return prepared.result;
    const sessionCache = cache(runtime);
    if (!sessionCache.has(prepared.path)) return { error: "must call read_file on this path first (read-before-edit invariant).", path: prepared.path };
    try {
      const result = await this.files.readFile(prepared.path, environment(runtime)) as ReadResult;
      if (result.kind === "binary") return { error: "binary file refused", path: prepared.path };
      if (result.kind === "toolarge") return { error: `file too large (${result.size} bytes)`, path: prepared.path };
      if (result.kind === "missing") return { error: "file not found", path: prepared.path };
      const original = result.content;
      let content = original;
      let replacements = 0;
      for (const edit of edits) {
        if (edit.old_string === edit.new_string) return { error: "old_string and new_string are identical", path: prepared.path };
        if (!edit.old_string) return { error: "old_string cannot be empty", path: prepared.path };
        let count = 0;
        let at = 0;
        while ((at = content.indexOf(edit.old_string, at)) !== -1) { count++; at += edit.old_string.length; }
        if (count === 0) return { error: `old_string not found: ${JSON.stringify(edit.old_string.slice(0, 80))}. Re-read the file and copy the exact text.`, path: prepared.path };
        if (!edit.replace_all && count > 1) return { error: "old_string is not unique. Provide more surrounding context, or set replace_all=true.", path: prepared.path };
        content = edit.replace_all ? content.split(edit.old_string).join(edit.new_string) : content.replace(edit.old_string, edit.new_string);
        replacements += edit.replace_all ? count : 1;
      }
      if (runtime.isPlanMode?.()) {
        queue(runtime, { kind, path: prepared.path, originalContent: original, proposedContent: content, isNewFile: false });
      } else {
        await this.files.writeFile(prepared.path, content, environment(runtime), "ai-tools-files-native");
      }
      sessionCache.set(prepared.path, { size: content.length, hash: djb2(content) });
      return { ok: true, replacements, bytesWritten: content.length, path: prepared.path, ...(runtime.isPlanMode?.() ? { queued_for_plan_review: true } : {}) };
    } catch (error) { return { error: String(error), path: prepared.path }; }
  }
}

export const EMPTY_SCHEMA = EMPTY;
