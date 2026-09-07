import { execFile, spawn } from "node:child_process";
import { accessSync, constants, existsSync, statSync } from "node:fs";
import { homedir, userInfo } from "node:os";
import { join } from "node:path";

const MAX_OUTPUT_BYTES = 2 * 1024 * 1024;
const MAX_ALLOWED_OUTPUT_BYTES = 128 * 1024 * 1024;
const ALLOWED_EXECUTABLES = new Set(["gh", "glab", "tea", "brew"]);
const GH_FIELDS = "number,title,author,isDraft,updatedAt,url,headRefOid,reviewDecision";
const GH_DETAIL_FIELDS = [
  "number",
  "title",
  "body",
  "author",
  "isDraft",
  "updatedAt",
  "url",
  "headRefOid",
  "headRefName",
  "baseRefName",
  "reviewDecision",
  "baseRefOid",
  "headRepository",
  "headRepositoryOwner",
  "mergeStateStatus",
  "mergeable",
  "additions",
  "deletions",
  "commits",
  "statusCheckRollup",
  "reviews",
  "comments",
  "reviewRequests",
  "latestReviews",
].join(",");
const GH_REVIEW_THREADS_QUERY = `query($owner:String!,$name:String!,$number:Int!){repository(owner:$owner,name:$name){pullRequest(number:$number){reviewThreads(first:100){nodes{id isResolved isOutdated path line startLine diffSide comments(first:100){nodes{id databaseId body createdAt author{login}}}}}}}}`;

export interface ForgeRunRequest {
  executable: string;
  args: string[];
  cwd?: string;
  timeoutMs?: number;
  maxOutputBytes?: number;
  refreshExecutable?: boolean;
  stdin?: string;
}

export interface ForgeRunOutput {
  stdout: string;
  stderr: string;
  exitCode: number | null;
  timedOut: boolean;
  truncated: boolean;
  notFound: boolean;
}

function addDirectory(target: string[], seen: Set<string>, directory?: string): void {
  if (!directory) return;
  const normalized = directory.trim();
  if (!normalized || seen.has(normalized)) return;
  seen.add(normalized);
  target.push(normalized);
}

export function buildRemoteForgePath(basePath: string, loginPath: string, home: string): string {
  const directories: string[] = [];
  const seen = new Set<string>();
  for (const directory of loginPath.split(":")) addDirectory(directories, seen, directory);
  for (const directory of basePath.split(":")) addDirectory(directories, seen, directory);
  addDirectory(directories, seen, join(home, ".local", "bin"));
  addDirectory(directories, seen, join(home, "bin"));
  addDirectory(directories, seen, join(home, ".asdf", "shims"));
  addDirectory(directories, seen, join(home, ".local", "share", "mise", "shims"));
  addDirectory(
    directories,
    seen,
    process.env.MISE_DATA_DIR && join(process.env.MISE_DATA_DIR, "shims"),
  );
  addDirectory(directories, seen, join(home, ".local", "share", "aquaproj-aqua", "bin"));
  addDirectory(directories, seen, join(home, ".proto", "shims"));
  addDirectory(directories, seen, join(home, ".nix-profile", "bin"));
  addDirectory(directories, seen, "/opt/homebrew/bin");
  addDirectory(directories, seen, "/usr/local/bin");
  addDirectory(directories, seen, "/opt/local/bin");
  addDirectory(directories, seen, "/home/linuxbrew/.linuxbrew/bin");
  addDirectory(directories, seen, join(home, ".linuxbrew", "bin"));
  addDirectory(directories, seen, "/snap/bin");
  addDirectory(directories, seen, "/nix/var/nix/profiles/default/bin");
  return directories.join(":");
}

function executableExists(candidate: string): boolean {
  try {
    return (
      existsSync(candidate) &&
      statSync(candidate).isFile() &&
      (accessSync(candidate, constants.X_OK), true)
    );
  } catch {
    return false;
  }
}

function loginShell(): string | undefined {
  try {
    return userInfo().shell || process.env.SHELL || undefined;
  } catch {
    return process.env.SHELL || undefined;
  }
}

function readLoginPath(shell: string): Promise<string> {
  return new Promise((resolve) => {
    const child = execFile(
      shell,
      ["-l", "-c", "printf '%s\\n' \"$PATH\""],
      { timeout: 3_000 },
      (error, stdout) => resolve(error ? "" : (stdout?.trim().split("\n").pop() ?? "")),
    );
    child.on("error", () => resolve(""));
  });
}

let pathPromise: Promise<string> | null = null;
const executableCache = new Map<string, string | null>();

async function remoteForgePath(): Promise<string> {
  if (pathPromise) return pathPromise;
  pathPromise = (async () => {
    const shell = loginShell();
    const loginPath = shell ? await readLoginPath(shell) : "";
    return buildRemoteForgePath(process.env.PATH ?? "", loginPath, homedir());
  })();
  return pathPromise;
}

async function resolveExecutable(executable: string): Promise<string | null> {
  if (executableCache.has(executable)) return executableCache.get(executable) ?? null;
  const path = await remoteForgePath();
  const resolved =
    path
      .split(":")
      .map((directory) => join(directory, executable))
      .find(executableExists) ?? null;
  executableCache.set(executable, resolved);
  return resolved;
}

function validateRequest(request: ForgeRunRequest): void {
  if (!ALLOWED_EXECUTABLES.has(request.executable)) {
    throw new Error("Unsupported forge executable");
  }
  if (!Array.isArray(request.args) || request.args.length > 128) {
    throw new Error("Invalid forge command arguments");
  }
  if (request.args.some((arg) => typeof arg !== "string" || arg.length > 32_768)) {
    throw new Error("Invalid forge command argument");
  }
  if (request.cwd !== undefined && typeof request.cwd !== "string") {
    throw new Error("Invalid forge working directory");
  }
  if (request.stdin !== undefined) {
    if (typeof request.stdin !== "string" || Buffer.byteLength(request.stdin) > 2 * 1024 * 1024) {
      throw new Error("Invalid forge command input");
    }
    if (!allowedForgeInput(request.executable, request.args, request.stdin)) {
      throw new Error("Unsupported forge command input");
    }
  }
  if (
    request.maxOutputBytes !== undefined &&
    (!Number.isSafeInteger(request.maxOutputBytes) ||
      request.maxOutputBytes < 1 ||
      request.maxOutputBytes > MAX_ALLOWED_OUTPUT_BYTES)
  ) {
    throw new Error("Invalid forge output limit");
  }
  if (!allowedForgeCommand(request.executable, request.args)) {
    throw new Error("Unsupported forge command");
  }
}

export function allowedForgeInput(executable: string, args: string[], stdin: string): boolean {
  if (executable === "glab") {
    if (!allowedForgeCommand(executable, args) || !exact(args.slice(-2), ["--input", "-"])) return false;
    try {
      const value = JSON.parse(stdin);
      if (!value || typeof value !== "object" || Array.isArray(value)) return false;
      if (Object.keys(value).some((key) => !["body", "position"].includes(key))) return false;
      if (typeof value.body !== "string" || !safeCommentBody(value.body)) return false;
      if (value.position === undefined) return true;
      if (!args[5]?.endsWith("/discussions")) return false;
      const p = value.position;
      if (!p || typeof p !== "object" || Array.isArray(p)) return false;
      if (Object.keys(p).some((key) => !["base_sha", "start_sha", "head_sha", "old_path", "new_path", "position_type", "old_line", "new_line"].includes(key))) return false;
      return [p.base_sha, p.start_sha, p.head_sha].every((sha) => typeof sha === "string" && safeSha(sha)) &&
        [p.old_path, p.new_path].every((path) => typeof path === "string" && safeChangedPath(path)) &&
        p.position_type === "text" && (p.old_line !== undefined || p.new_line !== undefined) &&
        [p.old_line, p.new_line].every((line) => line === undefined || (Number.isSafeInteger(line) && line > 0));
    } catch { return false; }
  }
  if (
    executable !== "gh" ||
    args.length !== 8 ||
    args[0] !== "api" ||
    args[1] !== "--hostname" ||
    !safeHost(args[2]) ||
    args[3] !== "--method" ||
    args[4] !== "POST" ||
    !/^repos\/(.+)\/pulls\/[1-9]\d*\/reviews$/.test(args[5] ?? "") ||
    !safeRepository(/^repos\/(.+)\/pulls\/[1-9]\d*\/reviews$/.exec(args[5] ?? "")?.[1]) ||
    args[6] !== "--input" ||
    args[7] !== "-"
  ) {
    return false;
  }
  try {
    const value = JSON.parse(stdin) as Record<string, unknown>;
    if (!safeSha(typeof value.commit_id === "string" ? value.commit_id : undefined)) return false;
    if (!["COMMENT", "APPROVE", "REQUEST_CHANGES"].includes(String(value.event))) return false;
    if (value.body !== undefined && !safeCommentBody(String(value.body))) return false;
    if (!Array.isArray(value.comments) || value.comments.length > 50) return false;
    return value.comments.every((entry) => {
      if (!entry || typeof entry !== "object") return false;
      const comment = entry as Record<string, unknown>;
      return (
        safeChangedPath(typeof comment.path === "string" ? comment.path : undefined) &&
        Number.isSafeInteger(comment.line) &&
        Number(comment.line) > 0 &&
        (comment.side === "LEFT" || comment.side === "RIGHT") &&
        safeCommentBody(typeof comment.body === "string" ? comment.body : undefined)
      );
    });
  } catch {
    return false;
  }
}

function exact(args: string[], expected: readonly string[]): boolean {
  return args.length === expected.length && args.every((value, index) => value === expected[index]);
}

const safeRepository = (value: string | undefined) => {
  if (!value || !/^[a-z0-9._/-]+$/i.test(value)) return false;
  const segments = value.split("/");
  return (
    segments.length >= 2 &&
    segments.every((segment) => Boolean(segment) && segment !== "." && segment !== "..")
  );
};
const safeRemote = (value: string | undefined) =>
  Boolean(value && /^(?:https?|ssh|git):\/\/[^\s]+$|^(?:[^@\s]+@)?[^:\s/]+:[^\s]+$/.test(value));
const safeReviewNumber = (value: string | undefined) => Boolean(value && /^[1-9]\d*$/.test(value));
const safeHost = (value: string | undefined) => Boolean(value && /^[a-z0-9.-]+$/i.test(value));
const safeSha = (value: string | undefined) => Boolean(value && /^[a-f0-9]{7,64}$/i.test(value));
const safeCommentBody = (value: string | undefined) =>
  Boolean(value?.trim() && value.length <= 32_005);
const safeChangedPath = (value: string | undefined) => {
  if (
    !value ||
    value.startsWith("-") ||
    value.startsWith("/") ||
    value.startsWith("\\") ||
    /[\0\r\n]/.test(value) ||
    value.length > 4_096
  )
    return false;
  return value.split(/[\\/]/).every((segment) => segment && segment !== "." && segment !== "..");
};
const safeGitHubCommentEndpoint = (value: string | undefined) => {
  const match = /^repos\/(.+)\/pulls\/([1-9]\d*)\/comments$/.exec(value ?? "");
  return Boolean(match && safeRepository(match[1]));
};
const safeProjectEndpoint = (value: string | undefined, suffix: RegExp) => {
  const match = /^projects\/([^/]+)\/(.+)$/.exec(value ?? "");
  if (!match || !suffix.test(match[2] ?? "")) return false;
  try {
    return safeRepository(decodeURIComponent(match[1] ?? ""));
  } catch {
    return false;
  }
};

function safeFields(
  args: string[],
  start: number,
  validators: Record<string, (value: string) => boolean>,
): boolean {
  if ((args.length - start) % 2 !== 0) return false;
  for (let index = start; index < args.length; index += 2) {
    if (args[index] !== "-f" && args[index] !== "-F") return false;
    const field = args[index + 1] ?? "";
    const equals = field.indexOf("=");
    if (equals <= 0) return false;
    const key = field.slice(0, equals);
    const value = field.slice(equals + 1);
    if (!validators[key]?.(value)) return false;
  }
  return true;
}

export function allowedForgeCommand(executable: string, args: string[]): boolean {
  if (exact(args, ["--version"])) return true;
  if (executable === "brew") return false;
  if (executable === "gh") {
    if (
      args.length === 4 &&
      exact(args.slice(0, 3), ["auth", "status", "--hostname"]) &&
      /^[a-z0-9.-]+$/i.test(args[3] ?? "")
    ) {
      return true;
    }
    if (
      args.length === 8 &&
      args[0] === "api" &&
      args[1] === "--hostname" &&
      safeHost(args[2]) &&
      exact(args.slice(3, 5), ["--method", "POST"]) &&
      /^repos\/(.+)\/pulls\/[1-9]\d*\/reviews$/.test(args[5] ?? "") &&
      safeRepository(/^repos\/(.+)\/pulls\/[1-9]\d*\/reviews$/.exec(args[5] ?? "")?.[1]) &&
      exact(args.slice(6), ["--input", "-"])
    )
      return true;
    if (
      args.length === 12 &&
      exact(args.slice(0, 4), ["api", "graphql", "--hostname", args[3] ?? ""]) &&
      safeHost(args[3]) &&
      args[4] === "-f" &&
      args[5] === `query=${GH_REVIEW_THREADS_QUERY}` &&
      args[6] === "-f" &&
      /^owner=[a-z0-9._-]+$/i.test(args[7] ?? "") &&
      args[8] === "-f" &&
      /^name=[a-z0-9._-]+$/i.test(args[9] ?? "") &&
      args[10] === "-F" &&
      /^number=[1-9]\d*$/.test(args[11] ?? "")
    )
      return true;
    if (
      args.length === 8 &&
      exact(args.slice(0, 2), ["api", "graphql"]) &&
      args[2] === "--hostname" &&
      safeHost(args[3]) &&
      args[4] === "-f" &&
      /^query=mutation\(\$threadId:ID!\)\{(?:resolveReviewThread|unresolveReviewThread)/.test(args[5] ?? "") &&
      args[6] === "-f" &&
      /^threadId=[A-Za-z0-9_=-]{8,256}$/.test(args[7] ?? "")
    )
      return true;
    if (
      (args.length === 6 || args.length === 8) &&
      exact(args.slice(0, 2), ["pr", "review"]) &&
      safeReviewNumber(args[2]) &&
      args[3] === "--repo" &&
      safeRepository(args[4]) &&
      ["--approve", "--comment", "--request-changes"].includes(args[5] ?? "") &&
      (args.length === 6 ||
        (args[6] === "--body" && safeCommentBody(args[7])))
    )
      return true;
    if (
      args.length === 10 &&
      exact(args.slice(0, 6), ["pr", "list", "--state", "open", "--limit", "50"]) &&
      args[6] === "--repo" &&
      safeRepository(args[7]) &&
      args[8] === "--json" &&
      args[9] === GH_FIELDS
    )
      return true;
    if (
      args.length === 7 &&
      exact(args.slice(0, 2), ["pr", "view"]) &&
      safeReviewNumber(args[2]) &&
      args[3] === "--repo" &&
      safeRepository(args[4]) &&
      args[5] === "--json" &&
      args[6] === GH_DETAIL_FIELDS
    )
      return true;
    if (
      args.length === 7 &&
      exact(args.slice(0, 2), ["pr", "comment"]) &&
      safeReviewNumber(args[2]) &&
      args[3] === "--repo" &&
      safeRepository(args[4]) &&
      args[5] === "--body" &&
      safeCommentBody(args[6])
    )
      return true;
    if (
      args.length === 5 &&
      args[0] === "api" &&
      args[1] === "--hostname" &&
      safeHost(args[2]) &&
      /^repos\/(.+)\/pulls\/[1-9]\d*\/comments$/.test(args[3] ?? "") &&
      safeRepository(/^repos\/(.+)\/pulls\/[1-9]\d*\/comments$/.exec(args[3] ?? "")?.[1]) &&
      args[4] === "--paginate"
    )
      return true;
    if (
      args.length === 16 &&
      args[0] === "api" &&
      args[1] === "--hostname" &&
      safeHost(args[2]) &&
      exact(args.slice(3, 5), ["--method", "POST"]) &&
      safeGitHubCommentEndpoint(args[5]) &&
      args[6] === "-f" &&
      args[7]?.startsWith("body=") &&
      safeCommentBody(args[7]?.slice(5)) &&
      args[8] === "-f" &&
      args[9]?.startsWith("commit_id=") &&
      safeSha(args[9]?.slice(10)) &&
      args[10] === "-f" &&
      args[11]?.startsWith("path=") &&
      safeChangedPath(args[11]?.slice(5)) &&
      args[12] === "-F" &&
      /^line=[1-9]\d*$/.test(args[13] ?? "") &&
      args[14] === "-f" &&
      /^(?:side=RIGHT|side=LEFT)$/.test(args[15] ?? "")
    )
      return true;
    if (
      args.length === 8 &&
      args[0] === "api" &&
      args[1] === "--hostname" &&
      safeHost(args[2]) &&
      exact(args.slice(3, 5), ["--method", "POST"]) &&
      /^repos\/(.+)\/pulls\/[1-9]\d*\/comments\/[1-9]\d*\/replies$/.test(args[5] ?? "") &&
      safeRepository(
        /^repos\/(.+)\/pulls\/[1-9]\d*\/comments\/[1-9]\d*\/replies$/.exec(args[5] ?? "")?.[1],
      ) &&
      args[6] === "-f" &&
      args[7]?.startsWith("body=") &&
      safeCommentBody(args[7]?.slice(5))
    )
      return true;
    return (
      args.length === 7 &&
      exact(args.slice(0, 2), ["pr", "diff"]) &&
      safeReviewNumber(args[2]) &&
      args[3] === "--repo" &&
      safeRepository(args[4]) &&
      exact(args.slice(5), ["--color", "never"])
    );
  }
  if (executable === "glab") {
    if (args.length === 4 && exact(args.slice(0, 3), ["auth", "status", "--hostname"]) &&
      safeHost(args[3]) && !args[3]?.startsWith("-")) return true;
    if (args.length === 8 && exact(args.slice(0, 2), ["api", "--hostname"]) && safeHost(args[2]) &&
      exact(args.slice(3, 5), ["--method", "POST"]) &&
      safeProjectEndpoint(args[5], /^merge_requests\/[1-9]\d*\/(?:notes|discussions(?:\/[a-z0-9_-]{8,128}\/notes)?)$/i) &&
      exact(args.slice(6), ["--input", "-"])) return true;
    if (
      args.length === 8 &&
      args[0] === "mr" &&
      args[1] === "list" &&
      args[2] === "--repo" &&
      safeRemote(args[3]) &&
      exact(args.slice(4), ["--per-page", "50", "--output", "json"])
    )
      return true;
    if (
      args.length === 8 &&
      exact(args.slice(0, 3), ["mr", "note", "list"]) &&
      safeReviewNumber(args[3]) &&
      args[4] === "--repo" &&
      safeRemote(args[5]) &&
      exact(args.slice(6), ["-F", "json"])
    )
      return true;
    if (
      (args.length === 5 || args.length === 7) &&
      exact(args.slice(0, 2), ["mr", "approve"]) &&
      safeReviewNumber(args[2]) &&
      args[3] === "--repo" &&
      safeRemote(args[4]) &&
      (args.length === 5 || (args[5] === "--sha" && safeSha(args[6])))
    )
      return true;
    if (
      args.length === 4 &&
      args[0] === "api" &&
      args[1] === "--hostname" &&
      safeHost(args[2]) &&
      safeProjectEndpoint(args[3], /^merge_requests\/[1-9]\d*\/approvals$/)
    )
      return true;
    if (
      args.length >= 8 &&
      args[0] === "api" &&
      args[1] === "--hostname" &&
      safeHost(args[2]) &&
      exact(args.slice(3, 5), ["--method", "PUT"]) &&
      safeProjectEndpoint(args[5], /^merge_requests\/[1-9]\d*\/discussions\/[a-z0-9_-]{8,128}$/i) &&
      safeFields(args, 6, { resolved: (value) => value === "true" || value === "false" })
    )
      return true;
    if (
      args.length === 8 &&
      exact(args.slice(0, 2), ["mr", "view"]) &&
      safeReviewNumber(args[2]) &&
      args[3] === "--repo" &&
      safeRemote(args[4]) &&
      exact(args.slice(5), ["--comments", "--output", "json"])
    )
      return true;
    if (
      args.length === 8 &&
      exact(args.slice(0, 3), ["mr", "note", "create"]) &&
      safeReviewNumber(args[3]) &&
      args[4] === "--repo" &&
      safeRemote(args[5]) &&
      args[6] === "--message" &&
      safeCommentBody(args[7])
    )
      return true;
    if (
      args.length === 12 &&
      exact(args.slice(0, 3), ["mr", "note", "create"]) &&
      safeReviewNumber(args[3]) &&
      args[4] === "--repo" &&
      safeRemote(args[5]) &&
      args[6] === "--file" &&
      safeChangedPath(args[7]) &&
      (args[8] === "--line" || args[8] === "--old-line") &&
      safeReviewNumber(args[9]) &&
      args[10] === "--message" &&
      safeCommentBody(args[11])
    )
      return true;
    if (
      args.length === 10 &&
      exact(args.slice(0, 3), ["mr", "note", "create"]) &&
      safeReviewNumber(args[3]) &&
      args[4] === "--repo" &&
      safeRemote(args[5]) &&
      args[6] === "--reply" &&
      /^[a-z0-9_-]{8,128}$/i.test(args[7] ?? "") &&
      args[8] === "--message" &&
      safeCommentBody(args[9])
    )
      return true;
    return (
      args.length === 8 &&
      exact(args.slice(0, 2), ["mr", "diff"]) &&
      safeReviewNumber(args[2]) &&
      args[3] === "--repo" &&
      safeRemote(args[4]) &&
      exact(args.slice(5), ["--raw", "--color", "never"])
    );
  }
  if (executable === "tea") {
    if (
      exact(args, ["login", "list", "--output", "json"]) ||
      exact(args, ["pulls", "list", "--state", "open", "--output", "json", "--limit", "50"]) ||
      exact(args, ["pulls", "list", "--state", "open", "--output", "json", "--limit", "50", "--fields", "index,title,state,author,updated,url"])
    )
      return true;
    if (
      args.length === 7 &&
      exact(args.slice(0, 2), ["comments", "add"]) &&
      safeReviewNumber(args[2]) &&
      args[3] === "--repo" &&
      safeRepository(args[4]) &&
      args[5] === "--description" &&
      safeCommentBody(args[6])
    )
      return true;
    if (
      args.length === 7 &&
      args[0] === "pulls" &&
      safeReviewNumber(args[1]) &&
      args[2] === "--repo" &&
      safeRepository(args[3]) &&
      exact(args.slice(4), ["--comments", "--output", "json"])
    )
      return true;
    return (
      args.length === 4 &&
      args[0] === "api" &&
      /^\/repos\/\{owner\}\/\{repo\}\/pulls\/[1-9]\d*\.diff$/.test(args[1] ?? "") &&
      args[2] === "--repo" &&
      safeRepository(args[3])
    );
  }
  return false;
}

export async function forgeRun(request: ForgeRunRequest): Promise<ForgeRunOutput> {
  validateRequest(request);
  const maxOutputBytes = request.maxOutputBytes ?? MAX_OUTPUT_BYTES;
  if (request.refreshExecutable) {
    executableCache.clear();
    pathPromise = null;
  }
  const searchPath = await remoteForgePath();
  const executable = await resolveExecutable(request.executable);
  if (!executable) {
    return {
      stdout: "",
      stderr: `${request.executable} was not found in the remote environment.`,
      exitCode: null,
      timedOut: false,
      truncated: false,
      notFound: true,
    };
  }
  return new Promise((resolve) => {
    const stdout: Buffer[] = [];
    const stderr: Buffer[] = [];
    let keptBytes = 0;
    let truncated = false;
    let settled = false;
    const child = spawn(executable, request.args, {
      cwd: request.cwd || undefined,
      env: {
        ...process.env,
        PATH: searchPath,
        NO_COLOR: "1",
        CLICOLOR: "0",
        PAGER: "cat",
        GH_PAGER: "cat",
        GLAB_PAGER: "cat",
        GH_PROMPT_DISABLED: "1",
        TERM: "dumb",
      },
      stdio: [request.stdin === undefined ? "ignore" : "pipe", "pipe", "pipe"],
    });
    const collect = (target: Buffer[], chunk: Buffer) => {
      const take = Math.min(chunk.length, maxOutputBytes - keptBytes);
      if (take > 0) {
        target.push(chunk.subarray(0, take));
        keptBytes += take;
      }
      if (take < chunk.length) truncated = true;
    };
    child.stdout?.on("data", (chunk: Buffer) => collect(stdout, chunk));
    child.stderr?.on("data", (chunk: Buffer) => collect(stderr, chunk));
    const finish = (partial: Partial<ForgeRunOutput>) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve({
        stdout: Buffer.concat(stdout).toString("utf8"),
        stderr: Buffer.concat(stderr).toString("utf8"),
        exitCode: partial.exitCode ?? null,
        timedOut: partial.timedOut ?? false,
        truncated,
        notFound: partial.notFound ?? false,
      });
    };
    const timeoutMs = Math.min(Math.max(request.timeoutMs ?? 30_000, 1_000), 120_000);
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      finish({ timedOut: true });
    }, timeoutMs);
    child.on("error", (error: NodeJS.ErrnoException) => {
      collect(stderr, Buffer.from(error.message));
      finish({ notFound: error.code === "ENOENT" });
    });
    let inputFailed = false;
    child.stdin?.on("error", (error: Error) => {
      inputFailed = true;
      collect(stderr, Buffer.from(error.message));
      // Keep collecting the CLI's diagnostic and wait for close (or timeout).
      // A partial input is never a successful publication, even with exit 0.
    });
    child.on("close", (exitCode) => finish({ exitCode: inputFailed ? null : exitCode }));
    if (request.stdin !== undefined) child.stdin?.end(request.stdin);
  });
}
