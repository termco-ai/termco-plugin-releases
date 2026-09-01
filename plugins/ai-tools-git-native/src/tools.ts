import type {
  AiToolContribution,
  AiToolDefinition,
} from "@termco/ai-tools-base";
import type { GitCapability, GitDiscardEntry } from "@termco/git-base";
import type { WorkspaceEnv } from "@termco/workspace-base";

export interface GitToolContext {
  getCwd(): string | null;
  getWorkspaceRoot(): string | null;
  getWorkspaceEnv?(): WorkspaceEnv;
}

const EMPTY_SCHEMA = {
  type: "object",
  properties: {},
  additionalProperties: false,
};
const PATHS_SCHEMA = {
  type: "object",
  properties: {
    paths: {
      type: "array",
      minItems: 1,
      items: { type: "string" },
      description: "Repository-relative file paths.",
    },
  },
  required: ["paths"],
  additionalProperties: false,
};
const NOT_A_REPO = {
  error:
    "not a git repository — the active terminal cwd is not inside a repo. Change into the project first.",
};

function values(input: unknown): Record<string, unknown> {
  return input && typeof input === "object"
    ? (input as Record<string, unknown>)
    : {};
}

async function inRepository(
  git: GitCapability,
  context: GitToolContext,
  operation: (repoRoot: string, workspace: WorkspaceEnv) => Promise<unknown>,
): Promise<unknown> {
  try {
    const workspace = context.getWorkspaceEnv?.() ?? { kind: "local" };
    const cwd = context.getCwd() ?? context.getWorkspaceRoot() ?? "";
    const repository = await git.resolveRepo(cwd, workspace);
    if (!repository) return NOT_A_REPO;
    return await operation(repository.repoRoot, workspace);
  } catch (error) {
    return { error: String(error) };
  }
}

function tool(
  description: string,
  inputSchema: Record<string, unknown>,
  execute: (input: unknown) => Promise<unknown>,
  needsApproval?: boolean,
): AiToolDefinition {
  return { description, inputSchema, execute, ...(needsApproval ? { needsApproval: true } : {}) };
}

export function buildGitTools(
  git: GitCapability,
  context: GitToolContext,
): Record<string, AiToolDefinition> {
  return {
    git_status: tool(
      "Show the current branch, ahead/behind counts, and every staged, unstaged, or untracked change.",
      EMPTY_SCHEMA,
      async () => inRepository(git, context, (root, env) => git.status(root, env)),
    ),
    git_diff: tool(
      "Show working-tree or staged changes for the whole repository or one path.",
      {
        type: "object",
        properties: {
          path: { type: "string", description: "Optional repository-relative path." },
          staged: { type: "boolean", description: "Diff the staged index against HEAD." },
        },
        additionalProperties: false,
      },
      async (input) => {
        const { path, staged } = values(input);
        return inRepository(git, context, (root, env) =>
          git.diff(
            root,
            typeof path === "string" ? path : undefined,
            staged === true,
            env,
          ),
        );
      },
    ),
    git_log: tool(
      "List recent commits with author, subject, and change statistics, newest first.",
      {
        type: "object",
        properties: { limit: { type: "integer", minimum: 1, description: "Maximum commits." } },
        additionalProperties: false,
      },
      async (input) => {
        const limit = values(input).limit;
        return inRepository(git, context, (root, env) =>
          git.log(root, typeof limit === "number" ? limit : 50, undefined, env),
        );
      },
    ),
    git_list_branches: tool(
      "List local, worktree, and remote-tracking branches and identify the current branch.",
      EMPTY_SCHEMA,
      async () => inRepository(git, context, (root, env) => git.listBranches(root, env)),
    ),
    git_show_commit: tool(
      "Show the complete diff of one commit by full or short SHA.",
      {
        type: "object",
        properties: { sha: { type: "string", description: "Commit SHA." } },
        required: ["sha"],
        additionalProperties: false,
      },
      async (input) =>
        inRepository(git, context, (root, env) =>
          git.showCommit(root, String(values(input).sha ?? ""), env),
        ),
    ),
    git_stage: tool(
      "Stage files for the next commit.",
      PATHS_SCHEMA,
      async (input) => {
        const paths = Array.isArray(values(input).paths)
          ? (values(input).paths as unknown[]).map(String)
          : [];
        return inRepository(git, context, async (root, env) => {
          await git.stage(root, paths, env);
          return { ok: true, staged: paths };
        });
      },
      true,
    ),
    git_unstage: tool(
      "Remove files from the index while preserving their working-tree changes.",
      PATHS_SCHEMA,
      async (input) => {
        const paths = Array.isArray(values(input).paths)
          ? (values(input).paths as unknown[]).map(String)
          : [];
        return inRepository(git, context, async (root, env) => {
          await git.unstage(root, paths, env);
          return { ok: true, unstaged: paths };
        });
      },
      true,
    ),
    git_discard: tool(
      "Permanently discard tracked changes and delete selected untracked files.",
      PATHS_SCHEMA,
      async (input) => {
        const paths = Array.isArray(values(input).paths)
          ? (values(input).paths as unknown[]).map(String)
          : [];
        return inRepository(git, context, async (root, env) => {
          const status = await git.status(root, env);
          const untracked = new Set(
            status.changedFiles.filter((file) => file.untracked).map((file) => file.path),
          );
          const entries: GitDiscardEntry[] = paths.map((path) => ({
            path,
            untracked: untracked.has(path),
          }));
          await git.discard(root, entries, env);
          return { ok: true, discarded: paths };
        });
      },
      true,
    ),
    git_commit: tool(
      "Create a commit from currently staged changes.",
      {
        type: "object",
        properties: { message: { type: "string", minLength: 1, description: "Commit message." } },
        required: ["message"],
        additionalProperties: false,
      },
      async (input) =>
        inRepository(git, context, (root, env) =>
          git.commit(root, String(values(input).message ?? ""), env),
        ),
      true,
    ),
    git_checkout_branch: tool(
      "Switch the working tree to an existing branch.",
      {
        type: "object",
        properties: { branch: { type: "string", minLength: 1 } },
        required: ["branch"],
        additionalProperties: false,
      },
      async (input) => {
        const branch = String(values(input).branch ?? "");
        return inRepository(git, context, async (root, env) => {
          await git.checkoutBranch(root, branch, env);
          return { ok: true, branch };
        });
      },
      true,
    ),
    git_fetch: tool(
      "Fetch remote updates without changing the working tree.",
      EMPTY_SCHEMA,
      async () => inRepository(git, context, async (root, env) => {
        await git.fetch(root, env);
        return { ok: true };
      }),
      true,
    ),
    git_pull: tool(
      "Fast-forward the current branch from its upstream without merging or rebasing.",
      EMPTY_SCHEMA,
      async () => inRepository(git, context, async (root, env) => {
        await git.pullFfOnly(root, env);
        return { ok: true };
      }),
      true,
    ),
    git_push: tool(
      "Push the current branch to its configured remote.",
      EMPTY_SCHEMA,
      async () => inRepository(git, context, (root, env) => git.push(root, env)),
      true,
    ),
  };
}

export function createGitToolContribution(git: GitCapability): AiToolContribution {
  return {
    id: "git",
    group: "git",
    order: 50,
    build: (context) => buildGitTools(git, context as GitToolContext),
  };
}
