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


describe("approved directory read/search access", () => {
  const input = { path: "/etc/nginx", target: "Local computer", reason: "Inspect the nginx configuration" };
  function setup() {
    const source = provider({ "/etc/nginx/nginx.conf": "server {}" });
    vi.mocked(source.files.stat).mockResolvedValue({ kind: "dir" });
    const context = runtime({ getSessionId: () => "chat-a" });
    const set = new FileToolSet(source.files);
    return { ...source, context, set, fs: set.fsTools(context), search: set.searchTools(context) };
  }

  it("blocks protected operations until access is granted and supports revocation", async () => {
    const { files, fs, search } = setup();
    for (const [tool, args] of [
      [fs.read_file, { path: "/etc/nginx/nginx.conf" }],
      [fs.list_directory, { path: "/etc/nginx" }],
      [fs.file_info, { path: "/etc/nginx" }],
      [search.grep, { root: "/etc/nginx", pattern: "server" }],
      [search.glob, { root: "/etc/nginx", pattern: "*.conf" }],
    ] as const) expect(await tool.execute(args)).toMatchObject({ requires_directory_approval: true, target: "Local computer" });
    expect(files.readFile).not.toHaveBeenCalled();
    expect(files.readDir).not.toHaveBeenCalled();
    expect(files.grep).not.toHaveBeenCalled();
    expect(files.glob).not.toHaveBeenCalled();
    expect(fs.request_directory_access.alwaysNeedsApproval).toBe(true);
    expect(await fs.request_directory_access.execute(input)).toMatchObject({ ok: true, scope: "current-chat", access: "read-and-search" });
    expect(await fs.read_file.execute({ path: "/etc/nginx/nginx.conf" })).toMatchObject({ content: "server {}" });
    await fs.list_directory.execute({ path: "/etc/nginx" });
    await search.grep.execute({ root: "/etc/nginx", pattern: "server" });
    expect(files.readDir).toHaveBeenCalled();
    expect(files.grep).toHaveBeenCalled();
    await fs.revoke_directory_access.execute({ path: "/etc/nginx" });
    expect(await fs.read_file.execute({ path: "/etc/nginx/nginx.conf" })).toHaveProperty("error");
  });

  it("retains approval across turns but isolates chats and remote targets", async () => {
    const { set, fs } = setup();
    await fs.request_directory_access.execute(input);
    const next = runtime({ getSessionId: () => "chat-a" });
    expect(await set.fsTools(next).read_file.execute({ path: "/etc/nginx/nginx.conf" })).toHaveProperty("content");
    for (const other of [
      runtime({ getSessionId: () => "chat-b" }),
      runtime({ getSessionId: () => "chat-a", getWorkspaceEnv: () => ({ kind: "ssh", connectionId: "server", host: "server" }) }),
      runtime(),
    ]) expect(await set.fsTools(other).read_file.execute({ path: "/etc/nginx/nginx.conf" })).toHaveProperty("error");
    const remote = runtime({ getSessionId: () => "chat-a", getWorkspaceEnv: () => ({ kind: "ssh", connectionId: "server", host: "server" }) });
    const remoteTools = set.fsTools(remote);
    expect(await remoteTools.request_directory_access.execute(input)).toHaveProperty("error");
    await remoteTools.request_directory_access.execute({ ...input, target: "SSH: server:22" });
    expect(await remoteTools.read_file.execute({ path: "/etc/nginx/nginx.conf" })).toHaveProperty("content");
    remote.getWorkspaceEnv = () => ({ kind: "ssh", connectionId: "different", host: "server" });
    expect(await remoteTools.read_file.execute({ path: "/etc/nginx/nginx.conf" })).toHaveProperty("error");
  });

  it("does not grant siblings, traversal, secrets, or mutations", async () => {
    const { fs, files } = setup();
    await fs.request_directory_access.execute(input);
    for (const path of ["/etc/nginx-other/a", "/etc/nginx/../hosts", "/etc/NGINX/a", "/etc/nginx/.env", "/etc/nginx/tls.key", "/etc/nginx/.ssh/config"]) {
      expect(await fs.read_file.execute({ path })).toHaveProperty("error");
    }
    await fs.request_directory_access.execute({ ...input, path: "/etc" });
    expect(await fs.read_file.execute({ path: "/etc/shadow" })).toHaveProperty("error");
    expect(await fs.write_file.execute({ path: "/etc/nginx/nginx.conf", content: "changed" })).toHaveProperty("error");
    expect(await fs.delete.execute({ path: "/etc/nginx/nginx.conf" })).toHaveProperty("error");
    expect(await fs.copy.execute({ sources: ["/etc/nginx/nginx.conf"], destDir: "/p" })).toHaveProperty("error");
    expect(files.copy).not.toHaveBeenCalled();
    expect(files.writeFile).not.toHaveBeenCalled();
    expect(files.delete).not.toHaveBeenCalled();
  });

  it("requires a verified directory and rejects redirection and cancellation", async () => {
    const { fs, files } = setup();
    expect(await fs.request_directory_access.execute({ ...input, path: "nginx" })).toHaveProperty("error");
    vi.mocked(files.stat).mockResolvedValue({ kind: "file" });
    expect(await fs.request_directory_access.execute(input)).toHaveProperty("error");
    vi.mocked(files.stat).mockResolvedValue({ kind: "dir" });
    vi.mocked(files.canonicalize).mockResolvedValue("/etc/other");
    expect(await fs.request_directory_access.execute(input)).toMatchObject({ canonical_path: "/etc/other" });
    vi.mocked(files.canonicalize).mockRejectedValue(new Error("offline"));
    expect(await fs.request_directory_access.execute(input)).toHaveProperty("error");
    vi.mocked(files.canonicalize).mockImplementation(async (path) => path);
    const controller = new AbortController(); controller.abort();
    expect(await fs.request_directory_access.execute(input, { signal: controller.signal })).toHaveProperty("error");
    expect(await fs.read_file.execute({ path: "/etc/nginx/nginx.conf" })).toHaveProperty("error");
  });

  it("fails closed for symlink escapes and unverifiable paths after approval", async () => {
    const { fs, files } = setup();
    await fs.request_directory_access.execute(input);
    vi.mocked(files.canonicalize).mockResolvedValue("/etc/hosts");
    expect(await fs.read_file.execute({ path: "/etc/nginx/link" })).toHaveProperty("error");
    vi.mocked(files.canonicalize).mockResolvedValue("/public/file");
    expect(await fs.read_file.execute({ path: "/etc/nginx/link" })).toHaveProperty("error");
    vi.mocked(files.canonicalize).mockRejectedValue(new Error("offline"));
    expect(await fs.read_file.execute({ path: "/etc/nginx/nginx.conf" })).toHaveProperty("error");
    expect(files.readFile).not.toHaveBeenCalled();
  });

  it("filters sensitive and out-of-scope search results", async () => {
    const { fs, files, search } = setup();
    await fs.request_directory_access.execute(input);
    const paths = ["/etc/nginx/nginx.conf", "/etc/nginx/.env", "/etc/hosts", "/etc/nginx/link"];
    vi.mocked(files.canonicalize).mockImplementation(async (path) => path.endsWith("/link") ? "/etc/shadow" : path);
    vi.mocked(files.grep).mockResolvedValue({ hits: paths.map((path) => ({ path, line: 1, text: "match" })) });
    vi.mocked(files.glob).mockResolvedValue({ hits: paths });
    expect(await search.grep.execute({ root: "/etc/nginx", pattern: "match" })).toMatchObject({ hits: [{ path: "/etc/nginx/nginx.conf" }] });
    expect(await search.glob.execute({ root: "/etc/nginx", pattern: "**/*" })).toMatchObject({ hits: ["/etc/nginx/nginx.conf"] });
  });
});
