import type { AiToolFileMutation, AiToolRuntime } from "@termco/ai-tools-base";
import type { WorkspaceFilesCapability } from "@termco/files-base";
import { describe, expect, it, vi } from "vitest";
import { FileToolSet } from "./tools";

function provider(initial: Record<string, string> = {}): {
  files: WorkspaceFilesCapability;
  content: Map<string, string>;
} {
  const content = new Map(Object.entries(initial));
  const files: WorkspaceFilesCapability = {
    readFile: vi.fn(async (path, _env, optional) => {
      const value = content.get(path);
      if (value === undefined) {
        if (optional) return { kind: "missing" };
        throw new Error("ENOENT");
      }
      return { kind: "text", content: value, size: value.length };
    }),
    writeFile: vi.fn(async (path, value) => { content.set(path, value); }),
    canonicalize: vi.fn(async (path) => path),
    stat: vi.fn(async () => ({ kind: "file", size: 4, mtime: 1 })),
    readDir: vi.fn(async () => [{ name: "src", kind: "dir" as const, size: 0, mtime: 1, gitignored: false }]),
    listSubdirs: vi.fn(async () => []),
    createFile: vi.fn(async () => {}),
    createDir: vi.fn(async () => {}),
    rename: vi.fn(async () => {}),
    delete: vi.fn(async () => {}),
    copy: vi.fn(async () => {}),
    watchAdd: vi.fn(async () => {}),
    watchRemove: vi.fn(async () => {}),
    search: vi.fn(async () => ({ hits: [], truncated: false })),
    listFiles: vi.fn(async () => []),
    grep: vi.fn(async () => ({ hits: [{ path: "/p/a.ts", rel: "a.ts", line: 1, text: "x".repeat(200) }], truncated: false, files_scanned: 1 })),
    grepInteractive: vi.fn(async () => ({ hits: [], truncated: false })),
    glob: vi.fn(async () => ({ hits: ["a.ts"], truncated: false })),
    readFileLocal: vi.fn(),
    ripgrepPath: "rg",
  };
  return { files, content };
}

function runtime(overrides: Partial<AiToolRuntime> = {}): AiToolRuntime {
  return {
    getCwd: () => "/p",
    getWorkspaceRoot: () => "/p",
    getWorkspaceEnv: () => ({ kind: "local" }),
    readCache: new Map(),
    ...overrides,
  };
}

describe("AI Tools: Files", () => {
  it("publishes independently replaceable fs, edit, and search groups", () => {
    expect(new FileToolSet(provider().files).contributions().map((entry) => entry.id))
      .toEqual(["fs", "edit", "search"]);
  });

  it("reads through the selected provider and short-circuits unchanged repeats", async () => {
    const source = provider({ "/p/a.ts": "export const a = 1;" });
    const context = runtime();
    const tool = new FileToolSet(source.files).fsTools(context).read_file;
    expect(await tool.execute({ path: "a.ts" })).toMatchObject({
      path: "/p/a.ts",
      content: "export const a = 1;",
    });
    expect(await tool.execute({ path: "a.ts" })).toEqual({
      path: "/p/a.ts",
      unchanged: true,
      size: 19,
    });
  });

  it("refuses sensitive paths before calling the provider", async () => {
    const source = provider({ "/p/.env": "TOKEN=x" });
    const result = await new FileToolSet(source.files).fsTools(runtime()).read_file.execute({ path: ".env" });
    expect(result).toMatchObject({ error: expect.stringContaining("sensitive-file") });
    expect(source.files.readFile).not.toHaveBeenCalled();
  });

  it("enforces read-before-edit and applies an exact edit atomically", async () => {
    const source = provider({ "/p/a.ts": "const answer = 41;" });
    const context = runtime();
    const set = new FileToolSet(source.files);
    const edit = set.editTools(context).edit;
    expect(await edit.execute({ path: "a.ts", old_string: "41", new_string: "42" }))
      .toMatchObject({ error: expect.stringContaining("read_file") });
    await set.fsTools(context).read_file.execute({ path: "a.ts" });
    expect(await edit.execute({ path: "a.ts", old_string: "41", new_string: "42" }))
      .toMatchObject({ ok: true, replacements: 1 });
    expect(source.content.get("/p/a.ts")).toBe("const answer = 42;");
    expect(edit.needsApproval).toBe(true);
  });

  it("queues plan-mode writes through the public session runtime", async () => {
    const mutations: AiToolFileMutation[] = [];
    const source = provider({ "/p/a.ts": "before" });
    const context = runtime({
      isPlanMode: () => true,
      queueFileMutation: (mutation) => mutations.push(mutation),
    });
    const result = await new FileToolSet(source.files).fsTools(context).write_file.execute({
      path: "a.ts",
      content: "after",
    });
    expect(result).toMatchObject({ ok: true, queued_for_plan_review: true });
    expect(mutations).toEqual([expect.objectContaining({
      kind: "write_file",
      path: "/p/a.ts",
      originalContent: "before",
      proposedContent: "after",
    })]);
    expect(source.files.writeFile).not.toHaveBeenCalled();
  });

  it("targets the chat's SSH workspace instead of global state", async () => {
    const source = provider({ "/remote/a.ts": "remote" });
    const env = { kind: "ssh" as const, connectionId: "server", host: "server" };
    await new FileToolSet(source.files).fsTools(runtime({
      getCwd: () => "/remote",
      getWorkspaceRoot: () => "/remote",
      getWorkspaceEnv: () => env,
    })).read_file.execute({ path: "a.ts" });
    expect(source.files.readFile).toHaveBeenCalledWith("/remote/a.ts", env);
  });

  it("searches through the provider and clips oversized match lines", async () => {
    const source = provider();
    const tools = new FileToolSet(source.files).searchTools(runtime());
    const grep = await tools.grep.execute({ pattern: "answer" }) as {
      hits: Array<{ text: string }>;
    };
    expect(grep.hits[0]?.text.length).toBeLessThan(200);
    expect(await tools.glob.execute({ pattern: "**/*.ts" })).toMatchObject({
      hits: ["a.ts"],
    });
  });
});
