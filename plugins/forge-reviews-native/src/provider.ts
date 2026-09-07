import type {
  ForgeProviderId,
  ForgeRepository,
  ForgeRepositoryState,
  ForgeReviewCheck,
  ForgeReviewDiscussion,
  ForgeReviewInspection,
  ForgeReviewList,
  ForgeReviewCommentDraft,
  ForgeReviewReadiness,
  ForgeReviewSubmitRequest,
  ForgeReviewSummary,
  ForgeReviewsCapability,
} from "@termco/forge-reviews-base";
import type { GitCapability } from "@termco/git-base";
import type { WorkspaceEnv } from "@termco/workspace-base";
import { MAX_REVIEW_DIFF_OUTPUT_BYTES, type ForgeCommand, type ForgeCommandRunner, type ForgeRunner } from "./runner";
import { reviewCache } from "./reviewCache";
import { reviewDiffLines } from "./diffLines";
import { parseUnifiedDiff } from "./unifiedDiff";

const CACHE_MS = 45_000;
const LIST_LIMIT = 50;
const MAX_COMMENT_CHARS = 32_000;

type RemoteIdentity = { host: string; slug: string };
type UnknownRecord = Record<string, unknown>;

const PROVIDERS = {
  github: {
    label: "GitHub",
    cli: "gh",
    reviewNoun: "pull request",
    documentationUrl: "https://github.com/cli/cli#installation",
    features: {
      approve: true,
      requestChanges: true,
      inlineComments: true,
      resolveThreads: true,
      reviewSubmission: true,
    },
  },
  gitlab: {
    label: "GitLab",
    cli: "glab",
    reviewNoun: "merge request",
    documentationUrl: "https://docs.gitlab.com/cli/#install-the-cli",
    features: {
      approve: true,
      requestChanges: false,
      inlineComments: true,
      resolveThreads: true,
      reviewSubmission: false,
    },
  },
  gitea: {
    label: "Gitea / Forgejo",
    cli: "tea",
    reviewNoun: "pull request",
    documentationUrl: "https://gitea.com/gitea/tea",
    features: {
      approve: false,
      requestChanges: false,
      inlineComments: false,
      resolveThreads: false,
      reviewSubmission: false,
    },
  },
} as const;

function record(value: unknown): UnknownRecord {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as UnknownRecord)
    : {};
}

function text(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function integer(value: unknown): number | null {
  if (typeof value === "number" && Number.isSafeInteger(value)) return value;
  if (typeof value === "string" && /^\d+$/.test(value)) return Number(value);
  return null;
}

function identifier(value: unknown): string | null {
  if (typeof value === "number" && Number.isSafeInteger(value)) return String(value);
  return text(value);
}

function array(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function boolean(value: unknown): boolean | null {
  return typeof value === "boolean" ? value : null;
}

export function parseRemoteIdentity(remoteUrl: string): RemoteIdentity | null {
  const trimmed = remoteUrl.trim();
  let host = "";
  let path = "";
  try {
    const url = new URL(trimmed);
    if (!["https:", "http:", "ssh:", "git:"].includes(url.protocol)) return null;
    host = url.hostname.toLowerCase();
    path = decodeURIComponent(url.pathname);
  } catch {
    const scp = /^(?:[^@\s]+@)?([^:\s/]+):(.+)$/.exec(trimmed);
    if (!scp) return null;
    host = scp[1]?.toLowerCase() ?? "";
    path = scp[2] ?? "";
  }
  const slug = path
    .replace(/^\/+/, "")
    .replace(/\/+$/, "")
    .replace(/\.git$/i, "");
  const segments = slug.split("/");
  if (!/^[a-z0-9.-]+$/i.test(host) || segments.length < 2) return null;
  if (
    segments.some(
      (segment) => !/^[a-z0-9._-]+$/i.test(segment) || segment === "." || segment === "..",
    )
  ) {
    return null;
  }
  return { host, slug };
}

function knownProvider(host: string): ForgeProviderId | null {
  if (host === "github.com" || host.includes("github")) return "github";
  if (host === "gitlab.com" || host.includes("gitlab")) return "gitlab";
  if (
    host === "codeberg.org" ||
    host === "gitea.com" ||
    host.includes("gitea") ||
    host.includes("forgejo")
  )
    return "gitea";
  return null;
}

function loginCommand(provider: ForgeProviderId, host: string): string {
  if (provider === "github") {
    return `gh auth login --hostname ${host} --web`;
  }
  if (provider === "gitlab") {
    return `glab auth login --hostname ${host} --web --use-keyring`;
  }
  return `tea login add --url https://${host}`;
}

async function teaHasLogin(
  runner: ForgeCommandRunner,
  workspace: WorkspaceEnv,
  cwd: string,
  host: string,
): Promise<boolean> {
  const result = await runner(
    { executable: "tea", args: ["login", "list", "--output", "json"], cwd, timeoutMs: 10_000 },
    workspace,
  );
  if (result.exitCode !== 0) return false;
  try {
    const parsed = JSON.parse(result.stdout) as unknown;
    const entries = Array.isArray(parsed) ? parsed : [];
    return entries.some((entry) => {
      const value = record(entry);
      const candidate = text(value.url) ?? text(value.URL) ?? text(value.host);
      if (!candidate) return false;
      try {
        return new URL(candidate).hostname.toLowerCase() === host;
      } catch {
        return (
          candidate
            .replace(/^https?:\/\//, "")
            .replace(/\/$/, "")
            .toLowerCase() === host
        );
      }
    });
  } catch {
    return false;
  }
}

async function authenticated(
  provider: ForgeProviderId,
  repository: ForgeRepository,
  runner: ForgeCommandRunner,
  workspace: WorkspaceEnv,
): Promise<boolean> {
  if (provider === "gitea") {
    return teaHasLogin(runner, workspace, repository.repoRoot, repository.host);
  }
  const result = await runner(
    {
      executable: PROVIDERS[provider].cli,
      args: ["auth", "status", "--hostname", repository.host],
      cwd: repository.repoRoot,
      timeoutMs: 15_000,
    },
    workspace,
  );
  return result.exitCode === 0;
}

async function detectCustomProvider(
  host: string,
  repoRoot: string,
  workspace: WorkspaceEnv,
  runner: ForgeCommandRunner,
): Promise<ForgeProviderId | null> {
  for (const provider of ["github", "gitlab"] as const) {
    const output = await runner(
      {
        executable: PROVIDERS[provider].cli,
        args: ["auth", "status", "--hostname", host],
        cwd: repoRoot,
        timeoutMs: 10_000,
      },
      workspace,
    );
    if (output.exitCode === 0) return provider;
  }
  return (await teaHasLogin(runner, workspace, repoRoot, host)) ? "gitea" : null;
}

async function installCommand(
  provider: ForgeProviderId,
  repoRoot: string,
  workspace: WorkspaceEnv,
  runner: ForgeCommandRunner,
  platform: NodeJS.Platform,
): Promise<string | null> {
  const formula = PROVIDERS[provider].cli;
  const usesWindowsHost =
    platform === "win32" && workspace?.kind !== "ssh" && workspace?.kind !== "wsl";
  if (!usesWindowsHost) {
    const brew = await runner(
      { executable: "brew", args: ["--version"], cwd: repoRoot, timeoutMs: 5_000 },
      workspace,
    );
    if (brew.exitCode === 0) return `brew install ${formula}`;
    return null;
  }
  const winget = await runner(
    { executable: "winget", args: ["--version"], cwd: repoRoot, timeoutMs: 5_000 },
    workspace,
  );
  if (winget.exitCode !== 0) return null;
  if (provider === "github") return "winget install --id GitHub.cli --exact";
  if (provider === "gitlab") return "winget install --id GLab.GLab --exact";
  return null;
}

function repositoryValue(
  provider: ForgeProviderId,
  identity: RemoteIdentity,
  repoRoot: string,
  remoteName: string,
): ForgeRepository {
  const meta = PROVIDERS[provider];
  return {
    provider,
    providerLabel: meta.label,
    cli: meta.cli,
    host: identity.host,
    slug: identity.slug,
    repoRoot,
    remoteUrl: `https://${identity.host}/${identity.slug}.git`,
    remoteName,
    reviewNoun: meta.reviewNoun,
    features: { ...meta.features },
  };
}

function githubReview(value: unknown): ForgeReviewSummary | null {
  const item = record(value);
  const number = integer(item.number);
  const title = text(item.title);
  const url = text(item.url);
  if (number === null || !title || !url) return null;
  const author = record(item.author);
  return {
    number,
    title,
    author: {
      login: text(author.login) ?? "unknown",
      name: text(author.name),
      avatarUrl: text(author.avatarUrl),
    },
    draft: item.isDraft === true,
    updatedAt: text(item.updatedAt),
    url,
    headSha: text(item.headRefOid),
    reviewStatus: text(item.reviewDecision),
  };
}

function gitlabReview(value: unknown): ForgeReviewSummary | null {
  const item = record(value);
  const number = integer(item.iid) ?? integer(item.id);
  const title = text(item.title);
  const url = text(item.web_url) ?? text(item.webUrl);
  if (number === null || !title || !url) return null;
  const author = record(item.author);
  return {
    number,
    title,
    author: {
      login: text(author.username) ?? text(author.login) ?? "unknown",
      name: text(author.name),
      avatarUrl: text(author.avatar_url) ?? text(author.avatarUrl),
    },
    draft: item.draft === true || /^draft\s*:/i.test(title),
    updatedAt: text(item.updated_at) ?? text(item.updatedAt),
    url,
    headSha: text(item.sha) ?? text(record(item.diff_refs).head_sha),
    reviewStatus: null,
  };
}

function giteaReview(value: unknown): ForgeReviewSummary | null {
  const item = record(value);
  const number = integer(item.index) ?? integer(item.number) ?? integer(item.id);
  const title = text(item.title);
  const url = text(item.html_url) ?? text(item.url);
  if (number === null || !title || !url) return null;
  const author = record(item.user ?? item.poster ?? item.author);
  return {
    number,
    title,
    author: {
      login: text(item.user) ?? text(item.author) ?? text(author.login) ?? text(author.username) ?? "unknown",
      name: text(author.full_name) ?? text(author.name),
      avatarUrl: text(author.avatar_url) ?? text(author.avatarUrl),
    },
    draft: item.draft === true,
    updatedAt: text(item.updated_at) ?? text(item.updated),
    url,
    headSha: text(record(item.head).sha) ?? text(item.head_sha) ?? text(item.headSha),
    reviewStatus: text(item.mergeable_state) ?? text(item.state),
  };
}

export function parseReviewList(provider: ForgeProviderId, stdout: string): ForgeReviewSummary[] {
  const parsed = JSON.parse(stdout) as unknown;
  const values = Array.isArray(parsed)
    ? parsed
    : Array.isArray(record(parsed).items)
      ? (record(parsed).items as unknown[])
      : [];
  const parser =
    provider === "github" ? githubReview : provider === "gitlab" ? gitlabReview : giteaReview;
  return values.flatMap((value) => {
    const review = parser(value);
    return review ? [review] : [];
  });
}

function listCommand(repository: ForgeRepository) {
  if (repository.provider === "github") {
    const target =
      repository.host === "github.com" ? repository.slug : `${repository.host}/${repository.slug}`;
    return {
      executable: "gh" as const,
      args: [
        "pr",
        "list",
        "--state",
        "open",
        "--limit",
        String(LIST_LIMIT),
        "--repo",
        target,
        "--json",
        "number,title,author,isDraft,updatedAt,url,headRefOid,reviewDecision",
      ],
    };
  }
  if (repository.provider === "gitlab") {
    return {
      executable: "glab" as const,
      args: [
        "mr",
        "list",
        "--repo",
        `https://${repository.host}/${repository.slug}.git`,
        "--per-page",
        String(LIST_LIMIT),
        "--output",
        "json",
      ],
    };
  }
  return {
    executable: "tea" as const,
    args: ["pulls", "list", "--state", "open", "--output", "json", "--limit", String(LIST_LIMIT), "--fields", "index,title,state,author,updated,url"],
  };
}

const GITHUB_DETAIL_FIELDS = [
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

const GITHUB_REVIEW_THREADS_QUERY = `query($owner:String!,$name:String!,$number:Int!){repository(owner:$owner,name:$name){pullRequest(number:$number){reviewThreads(first:100){nodes{id isResolved isOutdated path line startLine diffSide comments(first:100){nodes{id databaseId body createdAt author{login}}}}}}}}`;

function githubTarget(repository: ForgeRepository): string {
  return repository.host === "github.com"
    ? repository.slug
    : `${repository.host}/${repository.slug}`;
}

function detailCommand(repository: ForgeRepository, number: number) {
  if (repository.provider === "github") {
    return {
      executable: "gh" as const,
      args: [
        "pr",
        "view",
        String(number),
        "--repo",
        githubTarget(repository),
        "--json",
        GITHUB_DETAIL_FIELDS,
      ],
    };
  }
  if (repository.provider === "gitlab") {
    return {
      executable: "glab" as const,
      args: [
        "mr",
        "view",
        String(number),
        "--repo",
        `https://${repository.host}/${repository.slug}.git`,
        "--comments",
        "--output",
        "json",
      ],
    };
  }
  return {
    executable: "tea" as const,
    args: ["pulls", String(number), "--repo", repository.slug, "--comments", "--output", "json"],
  };
}

function diffCommand(repository: ForgeRepository, number: number) {
  if (repository.provider === "github") {
    return {
      executable: "gh" as const,
      args: ["pr", "diff", String(number), "--repo", githubTarget(repository), "--color", "never"],
    };
  }
  if (repository.provider === "gitlab") {
    return {
      executable: "glab" as const,
      args: [
        "mr",
        "diff",
        String(number),
        "--repo",
        `https://${repository.host}/${repository.slug}.git`,
        "--raw",
        "--color",
        "never",
      ],
    };
  }
  return {
    executable: "tea" as const,
    args: ["api", `/repos/{owner}/{repo}/pulls/${number}.diff`, "--repo", repository.slug],
  };
}

function discussionsCommand(repository: ForgeRepository, number: number) {
  if (repository.provider === "github") {
    const [owner, name] = repository.slug.split("/");
    return {
      executable: "gh" as const,
      args: [
        "api",
        "graphql",
        "--hostname",
        repository.host,
        "-f",
        `query=${GITHUB_REVIEW_THREADS_QUERY}`,
        "-f",
        `owner=${owner}`,
        "-f",
        `name=${name}`,
        "-F",
        `number=${number}`,
      ],
    };
  }
  if (repository.provider === "gitlab") {
    return {
      executable: "glab" as const,
      args: [
        "mr",
        "note",
        "list",
        String(number),
        "--repo",
        `https://${repository.host}/${repository.slug}.git`,
        "-F",
        "json",
      ],
    };
  }
  return null;
}

function githubThreadDiscussions(value: unknown): ForgeReviewDiscussion[] {
  const data = record(value);
  const repository = record(data.data).repository;
  const pullRequest = record(record(repository).pullRequest);
  const threads = array(record(pullRequest.reviewThreads).nodes);
  return threads.flatMap((value) => {
    const thread = record(value);
    const threadId = identifier(thread.id);
    if (!threadId) return [];
    const side = text(thread.diffSide)?.toUpperCase() === "LEFT" ? "old" : "new";
    const path = text(thread.path);
    const line = integer(thread.line) ?? integer(thread.startLine);
    const comments = array(record(thread.comments).nodes);
    const rootReplyId = identifier(record(comments[0]).databaseId);
    return comments.flatMap((value) => {
      const comment = record(value);
      const body = text(comment.body);
      if (!body) return [];
      return [
        {
          id: identifier(comment.databaseId) ?? identifier(comment.id),
          threadId,
          replyToId: rootReplyId,
          kind: "comment" as const,
          state: null,
          author: author(comment.author).login,
          body,
          createdAt: text(comment.createdAt),
          resolved: boolean(thread.isResolved),
          resolvable: true,
          outdated: thread.isOutdated === true,
          path,
          line,
          side,
        },
      ];
    });
  });
}

function approvalsCommand(repository: ForgeRepository, number: number) {
  if (repository.provider !== "gitlab") return null;
  return {
    executable: "glab" as const,
    args: [
      "api",
      "--hostname",
      repository.host,
      `projects/${encodeURIComponent(repository.slug)}/merge_requests/${number}/approvals`,
    ],
  };
}

function publishCommentCommand(
  repository: ForgeRepository,
  number: number,
  headSha: string,
  comment: ForgeReviewCommentDraft,
  inspection?: ForgeReviewInspection,
) {
  if (repository.provider === "github") {
    if (comment.replyToId) {
      return {
        executable: "gh" as const,
        args: [
          "api",
          "--hostname",
          repository.host,
          "--method",
          "POST",
          `repos/${repository.slug}/pulls/${number}/comments/${comment.replyToId}/replies`,
          "-f",
          `body=${comment.body}`,
        ],
      };
    }
    if (comment.path && comment.line && comment.side) {
      return {
        executable: "gh" as const,
        args: [
          "api",
          "--hostname",
          repository.host,
          "--method",
          "POST",
          `repos/${repository.slug}/pulls/${number}/comments`,
          "-f",
          `body=${comment.body}`,
          "-f",
          `commit_id=${headSha}`,
          "-f",
          `path=${comment.path}`,
          "-F",
          `line=${comment.line}`,
          "-f",
          `side=${comment.side === "new" ? "RIGHT" : "LEFT"}`,
        ],
      };
    }
    return {
      executable: "gh" as const,
      args: [
        "pr",
        "comment",
        String(number),
        "--repo",
        githubTarget(repository),
        "--body",
        comment.body,
      ],
    };
  }
  if (repository.provider === "gitlab") {
    if (!inspection) throw new Error("GitLab comments require an inspected revision.");
    return gitlabCommentCommand(repository, number, inspection, comment);
  }
  return {
    executable: "tea" as const,
    args: [
      "comments",
      "add",
      String(number),
      "--repo",
      repository.slug,
      "--description",
      comment.path && comment.line
        ? `**${comment.path}:${comment.line}**\n\n${comment.body}`
        : comment.body,
    ],
  };
}

function resolveThreadCommand(
  repository: ForgeRepository,
  number: number,
  threadId: string,
  resolved: boolean,
) {
  if (repository.provider === "github") {
    const mutation = resolved ? "resolveReviewThread" : "unresolveReviewThread";
    return {
      executable: "gh" as const,
      args: [
        "api",
        "graphql",
        "--hostname",
        repository.host,
        "-f",
        `query=mutation($threadId:ID!){${mutation}(input:{threadId:$threadId}){thread{id isResolved}}}`,
        "-f",
        `threadId=${threadId}`,
      ],
    };
  }
  if (repository.provider === "gitlab") {
    return {
      executable: "glab" as const,
      args: [
        "api",
        "--hostname",
        repository.host,
        "--method",
        "PUT",
        `projects/${encodeURIComponent(repository.slug)}/merge_requests/${number}/discussions/${threadId}`,
        "-F",
        `resolved=${resolved}`,
      ],
    };
  }
  return null;
}

function gitlabCommentCommand(
  repository: ForgeRepository,
  number: number,
  inspection: ForgeReviewInspection,
  comment: ForgeReviewCommentDraft,
): ForgeCommand {
  const base = `projects/${encodeURIComponent(repository.slug)}/merge_requests/${number}`;
  const endpoint = comment.replyToId
    ? `${base}/discussions/${comment.replyToId}/notes`
    : comment.path ? `${base}/discussions` : `${base}/notes`;
  let position: Record<string, unknown> | undefined;
  if (!comment.replyToId && comment.path && comment.line && comment.side) {
    const file = inspection.files.find((file) => file.path === comment.path);
    if (!file || !inspection.baseSha || !inspection.startSha || !inspection.summary.headSha) {
      throw new Error("Refresh this review before adding a line comment: its diff revision is unavailable.");
    }
    const line = reviewDiffLines(file.patch).find((line) =>
      comment.side === "old" ? line.oldLine === comment.line : line.newLine === comment.line
    );
    if (!line) throw new Error("The selected line is not part of this review diff.");
    position = {
      base_sha: inspection.baseSha,
      start_sha: inspection.startSha,
      head_sha: inspection.summary.headSha,
      old_path: file.previousPath ?? file.path,
      new_path: file.path,
      position_type: "text",
      ...(line.oldLine === null ? {} : { old_line: line.oldLine }),
      ...(line.newLine === null ? {} : { new_line: line.newLine }),
    };
  }
  return {
    executable: "glab",
    args: ["api", "--hostname", repository.host, "--method", "POST", endpoint, "--input", "-"],
    stdin: JSON.stringify({ body: comment.body, ...(position ? { position } : {}) }),
  };
}

function author(value: unknown): ForgeReviewSummary["author"] {
  const item = record(value);
  return {
    login: text(item.login) ?? text(item.username) ?? text(item.user_name) ?? "unknown",
    name: text(item.name) ?? text(item.full_name),
    avatarUrl: text(item.avatarUrl) ?? text(item.avatar_url),
  };
}

function discussion(
  value: unknown,
  context: {
    kind?: ForgeReviewDiscussion["kind"];
    threadId?: string | null;
    replyToId?: string | null;
  } = {},
): ForgeReviewDiscussion | null {
  const item = record(value);
  const body = text(item.body) ?? text(item.note) ?? text(item.comment);
  if (!body) return null;
  const position = record(item.position);
  const originalPosition = record(item.original_position);
  const id = identifier(item.id);
  const parentId = identifier(item.in_reply_to_id);
  const state = text(item.state) ?? text(item.status);
  const system = item.system === true;
  const providerSide = text(item.side)?.toUpperCase();
  const newLine = integer(position.new_line) ?? integer(originalPosition.new_line);
  const oldLine = integer(position.old_line) ?? integer(originalPosition.old_line);
  const side =
    providerSide === "RIGHT"
      ? "new"
      : providerSide === "LEFT"
        ? "old"
        : newLine !== null
          ? "new"
          : oldLine !== null
            ? "old"
            : null;
  return {
    id,
    threadId: context.threadId === undefined ? (parentId ?? id) : context.threadId,
    replyToId: system ? null : context.replyToId === undefined ? null : context.replyToId,
    kind: system ? "system" : (context.kind ?? (state ? "review" : "comment")),
    state,
    author: author(item.author ?? item.user ?? item.reviewer).login,
    body,
    createdAt: text(item.createdAt) ?? text(item.created_at) ?? text(item.submittedAt),
    resolved: boolean(item.resolved),
    resolvable: item.resolvable === true || item.canResolve === true,
    outdated:
      item.outdated === true ||
      item.isOutdated === true ||
      (Object.keys(position).length === 0 && Object.keys(originalPosition).length > 0),
    path:
      text(item.path) ??
      text(position.new_path) ??
      text(position.old_path) ??
      text(originalPosition.new_path) ??
      text(originalPosition.old_path),
    line: integer(item.line) ?? newLine ?? oldLine ?? integer(item.original_line),
    side,
  };
}

function nestedDiscussions(value: unknown): ForgeReviewDiscussion[] {
  return array(value).flatMap((entry) => {
    const item = record(entry);
    const threadId = identifier(item.id);
    const notes = array(item.notes);
    if (notes.length > 0)
      return notes.flatMap((note) => {
        const parsed = discussion(note, { threadId, replyToId: threadId });
        return parsed ? [parsed] : [];
      });
    const parsed = discussion(item, { threadId, replyToId: threadId });
    return parsed ? [parsed] : [];
  });
}

function check(value: unknown): ForgeReviewCheck | null {
  const item = record(value);
  const name = text(item.name) ?? text(item.context) ?? text(item.ref);
  if (!name) return null;
  return {
    name,
    state: text(item.conclusion) ?? text(item.state) ?? text(item.status) ?? "unknown",
    detailsUrl: text(item.detailsUrl) ?? text(item.web_url) ?? text(item.url),
  };
}

function reviewReadiness(
  provider: ForgeProviderId,
  item: UnknownRecord,
  summary: ForgeReviewSummary,
  discussions: ForgeReviewDiscussion[],
  checks: ForgeReviewCheck[],
  providerApprovals: unknown,
): ForgeReviewReadiness {
  const approvals = record(providerApprovals);
  const approvedBy = array(approvals.approved_by).flatMap((value) => {
    const login = author(record(value).user ?? value).login;
    return login === "unknown" ? [] : [login];
  });
  const approvalsRequired = provider === "gitlab" ? integer(approvals.approvals_required) : null;
  const approvalsRemaining = provider === "gitlab" ? integer(approvals.approvals_left) : null;
  const reviewerValues =
    provider === "github"
      ? [...array(item.reviewRequests).map((value) => record(value).requestedReviewer), ...array(item.latestReviews)]
      : array(item.reviewers);
  const reviewersByLogin = new Map<string, ForgeReviewReadiness["reviewers"][number]>();
  for (const value of reviewerValues) {
    const reviewer = record(value);
    const identity = author(reviewer.author ?? reviewer);
    if (identity.login === "unknown") continue;
    const rawState = (text(reviewer.state) ?? text(reviewer.reviewState) ?? "unknown").toLowerCase();
    const state = rawState.includes("approve")
      ? "approved"
      : rawState.includes("change")
        ? "changes_requested"
        : rawState.includes("comment")
          ? "commented"
          : rawState.includes("request") || rawState === "unknown" || provider === "gitlab"
            ? "requested"
            : "unknown";
    reviewersByLogin.set(identity.login, { ...identity, state });
  }
  for (const login of approvedBy) {
    const current = reviewersByLogin.get(login);
    reviewersByLogin.set(login, {
      login,
      name: current?.name ?? null,
      avatarUrl: current?.avatarUrl ?? null,
      state: "approved",
    });
  }

  const mergeableValue = text(item.mergeable)?.toLowerCase();
  const hasConflicts =
    boolean(item.has_conflicts) ??
    (mergeableValue === "conflicting" ? true : mergeableValue === "mergeable" ? false : null);
  const mergeable =
    mergeableValue === "mergeable"
      ? true
      : mergeableValue === "conflicting"
        ? false
        : boolean(item.mergeable);
  const blockingConversationsResolved = boolean(item.blocking_discussions_resolved);
  const blockers: string[] = [];
  if (summary.draft) blockers.push("Marked as draft");
  if (hasConflicts) blockers.push("Merge conflicts");
  if (approvalsRemaining !== null && approvalsRemaining > 0) {
    blockers.push(`${approvalsRemaining} approval${approvalsRemaining === 1 ? "" : "s"} required`);
  } else if (summary.reviewStatus?.toUpperCase() === "REVIEW_REQUIRED") {
    blockers.push("Review required");
  }
  if (summary.reviewStatus?.toUpperCase() === "CHANGES_REQUESTED") {
    blockers.push("Changes requested");
  }
  if (
    blockingConversationsResolved === false ||
    discussions.some(
      (conversation) =>
        conversation.kind !== "system" && conversation.resolvable && conversation.resolved === false,
    )
  ) {
    blockers.push("Open review conversations");
  }
  if (checks.some((item) => /fail|error|cancel|blocked/i.test(item.state))) {
    blockers.push("Checks failing");
  } else if (checks.some((item) => /pending|running|queued|in_progress/i.test(item.state))) {
    blockers.push("Checks pending");
  }
  return {
    mergeable,
    hasConflicts,
    blockingConversationsResolved,
    approvalsRequired,
    approvalsRemaining,
    approvedBy,
    reviewers: [...reviewersByLogin.values()],
    blockers: [...new Set(blockers)],
  };
}

function normalizeInspection(
  repository: ForgeRepository,
  metadata: unknown,
  patch: string,
  providerDiscussions: unknown = [],
  providerApprovals: unknown = {},
): ForgeReviewInspection {
  const provider = repository.provider;
  const item = record(metadata);
  const summary =
    provider === "github"
      ? githubReview(item)
      : provider === "gitlab"
        ? gitlabReview(item)
        : giteaReview(item);
  if (!summary) throw new Error("review metadata is missing its identity");
  const files = parseUnifiedDiff(patch);
  const additions = integer(item.additions) ?? files.reduce((sum, file) => sum + file.additions, 0);
  const deletions = integer(item.deletions) ?? files.reduce((sum, file) => sum + file.deletions, 0);
  if (provider === "github") {
    const checks = array(item.statusCheckRollup).flatMap((value) => {
      const parsed = check(value);
      return parsed ? [parsed] : [];
    });
    const discussions = [
      ...array(item.reviews).flatMap((value) => {
        const parsed = discussion(value, { kind: "review", threadId: null, replyToId: null });
        return parsed ? [parsed] : [];
      }),
      ...array(item.comments).flatMap((value) => {
        const parsed = discussion(value, { kind: "comment", threadId: null, replyToId: null });
        return parsed ? [parsed] : [];
      }),
      ...githubThreadDiscussions(providerDiscussions),
    ];
    return {
      summary,
      body: text(item.body) ?? "",
      baseRef: text(item.baseRefName),
      headRef: text(item.headRefName),
      baseSha: text(item.baseRefOid),
      sourceRepository:
        text(record(item.headRepository).nameWithOwner) ?? text(record(item.headRepository).name),
      targetRepository: repository.slug,
      additions,
      deletions,
      mergeStatus: text(item.mergeStateStatus) ?? text(item.mergeable),
      commits: array(item.commits).length,
      checks,
      discussions,
      readiness: reviewReadiness(provider, item, summary, discussions, checks, providerApprovals),
      files,
    };
  }
  if (provider === "gitlab") {
    const pipeline = record(item.head_pipeline ?? item.pipeline);
    const pipelineCheck = check(pipeline);
    const approvals = record(providerApprovals);
    const approvalsRequired = integer(approvals.approvals_required);
    const approvalsLeft = integer(approvals.approvals_left);
    const approvedBy = array(approvals.approved_by);
    const approvalStatus =
      approvalsRequired === 0
        ? "no approval required"
        : approvals.approved === true
          ? "approved"
          : approvalsLeft !== null
            ? `${approvalsLeft} approval${approvalsLeft === 1 ? "" : "s"} needed`
            : null;
    const approvalReviews = approvedBy.flatMap((value) => {
      const approval = record(value);
      const user = record(approval.user);
      const parsed = discussion(
        {
          id: user.id,
          author: user,
          body: "Approved this merge request.",
          created_at: approval.approved_at,
          state: "approved",
        },
        { kind: "review", threadId: null, replyToId: null },
      );
      return parsed ? [parsed] : [];
    });
    const discussions = [
      ...approvalReviews,
      ...nestedDiscussions(
        array(providerDiscussions).length > 0
          ? providerDiscussions
          : (item.Discussions ?? item.discussions ?? item.notes ?? item.comments),
      ),
    ];
    const checks = pipelineCheck ? [pipelineCheck] : [];
    const normalizedSummary = { ...summary, reviewStatus: approvalStatus };
    return {
      summary: normalizedSummary,
      body: text(item.description) ?? "",
      baseRef: text(item.target_branch),
      headRef: text(item.source_branch),
      baseSha: text(record(item.diff_refs).base_sha),
      startSha: text(record(item.diff_refs).start_sha),
      sourceRepository: null,
      targetRepository: repository.slug,
      additions,
      deletions,
      mergeStatus: text(item.detailed_merge_status) ?? text(item.merge_status),
      commits: integer(item.commits_count) ?? integer(item.diverged_commits_count) ?? 0,
      checks,
      discussions,
      readiness: reviewReadiness(
        provider,
        item,
        normalizedSummary,
        discussions,
        checks,
        providerApprovals,
      ),
      files,
    };
  }
  const checks = array(item.checks).flatMap((value) => {
    const parsed = check(value);
    return parsed ? [parsed] : [];
  });
  const discussions = [...array(item.reviews), ...array(item.comments)].flatMap((value) => {
    const parsed = discussion(value);
    return parsed ? [parsed] : [];
  });
  return {
    summary,
    body: text(item.body) ?? "",
    baseRef: text(item.base) ?? text(record(item.base).ref),
    headRef: text(item.head) ?? text(record(item.head).ref),
    baseSha: text(record(item.base).sha) ?? text(item.base_sha),
    sourceRepository: text(record(record(item.head).repo).full_name),
    targetRepository: repository.slug,
    additions,
    deletions,
    mergeStatus: boolean(item.mergeable) === true ? "mergeable" : text(item.state),
    commits: array(item.commits).length,
    checks,
    discussions,
    readiness: reviewReadiness(provider, item, summary, discussions, checks, providerApprovals),
    files,
  };
}

function assertCommandOutput(
  output: Awaited<ReturnType<ForgeCommandRunner>>,
  repository: ForgeRepository,
  operation: string,
): string {
  if (output.timedOut) throw new Error(`${repository.providerLabel} ${operation} timed out.`);
  if (output.truncated) {
    throw new Error(`${repository.providerLabel} ${operation} exceeded its output safety limit.`);
  }
  if (output.exitCode !== 0) {
    throw new Error(
      `${repository.providerLabel} could not load this ${repository.reviewNoun}. Check the CLI login, repository access, and network connection.`,
    );
  }
  return output.stdout;
}

function validateDraftComments(
  repository: ForgeRepository,
  inspection: ForgeReviewInspection,
  comments: readonly ForgeReviewCommentDraft[],
): void {
  if (comments.length > 50) throw new Error("Submit at most 50 review comments at once.");
  const changedPaths = new Set(inspection.files.map((file) => file.path));
  for (const comment of comments) {
    if (!comment.body.trim() || comment.body.length > MAX_COMMENT_CHARS) {
      throw new Error("Every review comment must contain at most 32,000 characters.");
    }
    if (comment.path && !comment.replyToId && !PROVIDERS[repository.provider].features.inlineComments) {
      throw new Error(`${repository.providerLabel} inline comments are unavailable here. Add an overall comment instead.`);
    }
    if (comment.path && !comment.replyToId && !changedPaths.has(comment.path)) {
      throw new Error("A draft comment targets a file that is no longer part of this review.");
    }
    if (comment.replyToId) {
      const validReplyTarget =
        repository.provider === "github"
          ? /^\d+$/.test(comment.replyToId)
          : repository.provider === "gitlab" && /^[a-z0-9_-]{8,128}$/i.test(comment.replyToId);
      if (!validReplyTarget) {
        throw new Error("A draft reply has an invalid or unsupported discussion target.");
      }
    }
    if (comment.line !== null && (!Number.isSafeInteger(comment.line) || comment.line <= 0)) {
      throw new Error("A draft comment has an invalid line number.");
    }
  }
}

function githubSubmitReviewCommand(request: ForgeReviewSubmitRequest, headSha: string) {
  const body = [
    request.summary.trim(),
    ...request.comments
      .filter((comment) => !comment.replyToId && !comment.path)
      .map((comment) => comment.body.trim()),
  ]
    .filter(Boolean)
    .join("\n\n");
  const comments = request.comments
    .filter((comment) => !comment.replyToId && comment.path && comment.line && comment.side)
    .map((comment) => ({
      path: comment.path!,
      line: comment.line!,
      side: comment.side === "old" ? "LEFT" : "RIGHT",
      body: comment.body,
    }));
  const event =
    request.outcome === "approve"
      ? "APPROVE"
      : request.outcome === "request_changes"
        ? "REQUEST_CHANGES"
        : "COMMENT";
  return {
    executable: "gh" as const,
    args: [
      "api",
      "--hostname",
      request.repository.host,
      "--method",
      "POST",
      `repos/${request.repository.slug}/pulls/${request.number}/reviews`,
      "--input",
      "-",
    ],
    stdin: JSON.stringify({ commit_id: headSha, event, ...(body ? { body } : {}), comments }),
  };
}

export function createForgeReviewsCapability(input: {
  git: GitCapability;
  runner: ForgeRunner;
  platform?: NodeJS.Platform;
}): ForgeReviewsCapability {
  const repositoryCache = reviewCache<ForgeRepositoryState>({ ttlMs: CACHE_MS, maxEntries: 64 });
  const listCache = reviewCache<ForgeReviewList>({ ttlMs: CACHE_MS, maxEntries: 32 });
  const inspectionCache = reviewCache<ForgeReviewInspection>({
    ttlMs: CACHE_MS, maxEntries: 12, maxWeight: 16 * 1024 * 1024,
    weight: (review) => review.body.length + review.files.reduce((sum, file) => sum + file.patch.length, 0) +
      review.discussions.reduce((sum, discussion) => sum + discussion.body.length, 0),
  });
  const now = () => Date.now();
  const capability: ForgeReviewsCapability = {
    async repository(request) {
      if (request.refresh) input.runner.clearExecutableCache();
      const cacheKey = `${JSON.stringify(request.workspace)}:${request.repoRoot}`;
      const cached = repositoryCache.get(cacheKey);
      if (!request.refresh && cached && now() - cached.at < CACHE_MS) return cached.value;
      try {
        const status = await input.git.status(request.repoRoot, request.workspace);
        const remoteName = status.upstream?.split("/")[0] ?? "origin";
        const remoteUrl =
          (await input.git.remoteUrl(request.repoRoot, remoteName, request.workspace)) ??
          (remoteName === "origin"
            ? null
            : await input.git.remoteUrl(request.repoRoot, "origin", request.workspace));
        if (!remoteUrl) {
          const value: ForgeRepositoryState = {
            kind: "unsupported",
            host: null,
            message: "Add a Git remote to discover hosted reviews.",
          };
          repositoryCache.set(cacheKey, { at: now(), value });
          return value;
        }
        const identity = parseRemoteIdentity(remoteUrl);
        if (!identity) {
          const value: ForgeRepositoryState = {
            kind: "unsupported",
            host: null,
            message: "The selected Git remote is not a supported hosted repository URL.",
          };
          repositoryCache.set(cacheKey, { at: now(), value });
          return value;
        }
        const provider =
          knownProvider(identity.host) ??
          (await detectCustomProvider(
            identity.host,
            request.repoRoot,
            request.workspace,
            input.runner.run,
          ));
        if (!provider) {
          const value: ForgeRepositoryState = {
            kind: "unsupported",
            host: identity.host,
            message: `No GitHub, GitLab, or Gitea/Forgejo CLI profile matches ${identity.host}.`,
          };
          repositoryCache.set(cacheKey, { at: now(), value });
          return value;
        }
        const repository = repositoryValue(
          provider,
          identity,
          request.repoRoot,
          remoteName,
        );
        const version = await input.runner.run(
          {
            executable: repository.cli,
            args: ["--version"],
            cwd: request.repoRoot,
            timeoutMs: 10_000,
          },
          request.workspace,
        );
        let value: ForgeRepositoryState;
        if (version.notFound || version.exitCode !== 0) {
          value = {
            kind: "cli-missing",
            repository,
            install: {
              command: await installCommand(
                provider,
                request.repoRoot,
                request.workspace,
                input.runner.run,
                input.platform ?? process.platform,
              ),
              documentationUrl: PROVIDERS[provider].documentationUrl,
            },
            loginCommand: loginCommand(provider, identity.host),
          };
        } else if (
          !(await authenticated(provider, repository, input.runner.run, request.workspace))
        ) {
          value = {
            kind: "not-authenticated",
            repository,
            loginCommand: loginCommand(provider, identity.host),
          };
        } else {
          value = { kind: "ready", repository };
        }
        repositoryCache.set(cacheKey, { at: now(), value });
        return value;
      } catch (error) {
        return {
          kind: "error",
          repository: null,
          message: error instanceof Error ? error.message : String(error),
        };
      }
    },
    async listOpen(request) {
      const key = `${JSON.stringify(request.workspace)}:${request.repository.provider}:${request.repository.host}:${request.repository.slug}`;
      const cached = listCache.get(key);
      if (!request.refresh && cached && now() - cached.at < CACHE_MS) return cached.value;
      const command = listCommand(request.repository);
      const output = await input.runner.run(
        { ...command, cwd: request.repository.repoRoot, timeoutMs: 30_000 },
        request.workspace,
      );
      if (output.timedOut)
        throw new Error(`${request.repository.providerLabel} review lookup timed out.`);
      if (output.truncated)
        throw new Error(`${request.repository.providerLabel} returned too much review data.`);
      if (output.exitCode !== 0) {
        throw new Error(
          `${request.repository.providerLabel} could not list open reviews. Check the CLI login and network connection.`,
        );
      }
      let reviews: ForgeReviewSummary[];
      try {
        reviews = parseReviewList(request.repository.provider, output.stdout);
      } catch {
        throw new Error(
          `${request.repository.providerLabel} returned an unsupported review response.`,
        );
      }
      const value = { reviews, truncated: reviews.length >= LIST_LIMIT };
      listCache.set(key, { at: now(), value });
      return value;
    },
    async inspect(request) {
      if (!Number.isSafeInteger(request.number) || request.number <= 0) {
        throw new Error("Review number must be a positive integer.");
      }
      const key = `${JSON.stringify(request.workspace)}:${request.repository.provider}:${request.repository.host}:${request.repository.slug}:${request.number}`;
      const cached = inspectionCache.get(key);
      if (!request.refresh && cached && now() - cached.at < CACHE_MS) return cached.value;
      const providerDiscussionCommand = discussionsCommand(request.repository, request.number);
      const providerApprovalsCommand = approvalsCommand(request.repository, request.number);
      const [metadataOutput, diffOutput, discussionsOutput, approvalsOutput] = await Promise.all([
        input.runner.run(
          {
            ...detailCommand(request.repository, request.number),
            cwd: request.repository.repoRoot,
            timeoutMs: 30_000,
          },
          request.workspace,
        ),
        input.runner.run(
          {
            ...diffCommand(request.repository, request.number),
            cwd: request.repository.repoRoot,
            timeoutMs: 60_000,
            maxOutputBytes: MAX_REVIEW_DIFF_OUTPUT_BYTES,
          },
          request.workspace,
        ),
        providerDiscussionCommand
          ? input.runner.run(
              { ...providerDiscussionCommand, cwd: request.repository.repoRoot, timeoutMs: 30_000 },
              request.workspace,
            )
          : Promise.resolve(null),
        providerApprovalsCommand
          ? input.runner.run(
              { ...providerApprovalsCommand, cwd: request.repository.repoRoot, timeoutMs: 30_000 },
              request.workspace,
            )
          : Promise.resolve(null),
      ]);
      const metadataText = assertCommandOutput(
        metadataOutput,
        request.repository,
        "review details",
      );
      const patch = assertCommandOutput(diffOutput, request.repository, "review diff");
      let metadata: unknown;
      let providerDiscussions: unknown = [];
      let providerApprovals: unknown = {};
      try {
        metadata = JSON.parse(metadataText) as unknown;
        if (discussionsOutput) {
          const discussionsText = assertCommandOutput(
            discussionsOutput,
            request.repository,
            "review discussions",
          );
          providerDiscussions = discussionsText.trim()
            ? (JSON.parse(discussionsText) as unknown)
            : [];
        }
        if (
          approvalsOutput &&
          approvalsOutput.exitCode === 0 &&
          !approvalsOutput.timedOut &&
          !approvalsOutput.truncated &&
          approvalsOutput.stdout.trim()
        ) {
          providerApprovals = JSON.parse(approvalsOutput.stdout) as unknown;
        }
      } catch {
        throw new Error(`${request.repository.providerLabel} returned unsupported review details.`);
      }
      const value = normalizeInspection(
        request.repository,
        metadata,
        patch,
        providerDiscussions,
        providerApprovals,
      );
      inspectionCache.set(key, { at: now(), value });
      return value;
    },
    async publishComments(request) {
      if (!Number.isSafeInteger(request.number) || request.number <= 0) {
        throw new Error("Review number must be a positive integer.");
      }
      if (!/^[a-f0-9]{7,64}$/i.test(request.expectedHeadSha)) {
        throw new Error("A valid expected review head is required.");
      }
      if (request.comments.length === 0 || request.comments.length > 50) {
        throw new Error("Publish between 1 and 50 review comments at once.");
      }
      const current = await capability.inspect({
        repository: request.repository,
        workspace: request.workspace,
        number: request.number,
        refresh: true,
      });
      const currentHead = current.summary.headSha;
      if (!currentHead || currentHead !== request.expectedHeadSha) {
        throw new Error(
          "This review changed since it was opened. Refresh it before publishing comments.",
        );
      }
      validateDraftComments(request.repository, current, request.comments);
      let published = 0;
      for (const [index, comment] of request.comments.entries()) {
        try {
          const output = await input.runner.run(
            { ...publishCommentCommand(request.repository, request.number, currentHead, comment, current),
              cwd: request.repository.repoRoot, timeoutMs: 30_000 }, request.workspace,
          );
          assertCommandOutput(output, request.repository, "publish review comment");
        } catch (cause) {
          return {
            published,
            headSha: currentHead,
            remaining: request.comments.slice(index),
            error: cause instanceof Error ? cause.message : String(cause),
          };
        }
        published += 1;
      }
      inspectionCache.clear();
      return { published, headSha: currentHead, remaining: [], error: null };
    },
    async submitReview(request) {
      if (!Number.isSafeInteger(request.number) || request.number <= 0) {
        throw new Error("Review number must be a positive integer.");
      }
      if (!/^[a-f0-9]{7,64}$/i.test(request.expectedHeadSha)) {
        throw new Error("A valid expected review head is required.");
      }
      if (request.summary.length > MAX_COMMENT_CHARS) {
        throw new Error("The review summary must contain at most 32,000 characters.");
      }
      if (request.outcome === "comment" && request.comments.length === 0 && !request.summary.trim()) {
        throw new Error("Add a comment or review summary before submitting.");
      }
      if (request.outcome === "approve" && !PROVIDERS[request.repository.provider].features.approve) {
        throw new Error(`${request.repository.providerLabel} approval is unavailable here.`);
      }
      if (request.outcome === "request_changes" && !PROVIDERS[request.repository.provider].features.requestChanges) {
        throw new Error(`${request.repository.providerLabel} change requests are unavailable here.`);
      }
      const current = await capability.inspect({
        repository: request.repository,
        workspace: request.workspace,
        number: request.number,
        refresh: true,
      });
      const currentHead = current.summary.headSha;
      if (!currentHead || currentHead !== request.expectedHeadSha) {
        throw new Error("This review changed since it was opened. Refresh it before submitting.");
      }
      validateDraftComments(request.repository, current, request.comments);

      // A comment count does not prove a review outcome was submitted. Return
      // explicit progress even when a later command or remote transport fails.
      let published = 0;
      let summarySubmitted = false;
      let remaining = [...request.comments];
      const run = async (command: ForgeCommand, operation: string) => {
        const output = await input.runner.run(
          { ...command, cwd: request.repository.repoRoot, timeoutMs: 30_000 },
          request.workspace,
        );
        assertCommandOutput(output, request.repository, operation);
      };
      try {
        if (request.repository.provider === "github") {
          const replies = request.comments.filter((comment) => comment.replyToId);
          const newComments = request.comments.filter((comment) => !comment.replyToId);
          remaining = [...replies, ...newComments];
          for (const comment of replies) {
            await run(publishCommentCommand(request.repository, request.number, currentHead, comment, current), "publish review reply");
            published += 1;
            remaining = remaining.slice(1);
          }
          if (newComments.length || request.summary.trim() || request.outcome !== "comment") {
            await run(githubSubmitReviewCommand({ ...request, comments: newComments }, currentHead), "submit review");
            published += newComments.length;
          }
          remaining = [];
          summarySubmitted = true;
        } else {
          // Publish exactly the confirmed comments. GitLab bulk_publish also
          // publishes web-created drafts, so it must never be used here.
          for (const comment of request.comments) {
            await run(publishCommentCommand(request.repository, request.number, currentHead, comment, current), "publish review comment");
            published += 1;
            remaining = remaining.slice(1);
          }
          if (request.summary.trim()) {
            await run(publishCommentCommand(request.repository, request.number, currentHead,
              { body: request.summary, path: null, line: null, side: null }, current), "publish review summary");
          }
          summarySubmitted = true;
          if (request.outcome === "approve") {
            await run({ executable: "glab", args: ["mr", "approve", String(request.number), "--repo",
              `https://${request.repository.host}/${request.repository.slug}.git`, "--sha", currentHead] }, "approve review");
          }
        }
        return { published, headSha: currentHead, remaining: [], error: null,
          outcome: request.outcome, outcomeSubmitted: true, summarySubmitted };
      } catch (cause) {
        return { published, headSha: currentHead, remaining,
          error: cause instanceof Error ? cause.message : String(cause),
          outcome: request.outcome, outcomeSubmitted: false, summarySubmitted };
      } finally {
        inspectionCache.clear();
      }
    },
    async setThreadResolved(request) {
      if (!Number.isSafeInteger(request.number) || request.number <= 0) {
        throw new Error("Review number must be a positive integer.");
      }
      if (!request.repository.features.resolveThreads) {
        throw new Error(`${request.repository.providerLabel} thread resolution is unavailable here.`);
      }
      const validThreadId =
        request.repository.provider === "github"
          ? /^[A-Za-z0-9_=-]{8,256}$/.test(request.threadId)
          : request.repository.provider === "gitlab" && /^[a-z0-9_-]{8,128}$/i.test(request.threadId);
      if (!validThreadId) throw new Error("The review conversation has an invalid thread ID.");
      const command = resolveThreadCommand(
        request.repository,
        request.number,
        request.threadId,
        request.resolved,
      );
      if (!command) throw new Error("This provider cannot resolve review conversations.");
      const output = await input.runner.run(
        { ...command, cwd: request.repository.repoRoot, timeoutMs: 30_000 },
        request.workspace,
      );
      assertCommandOutput(
        output,
        request.repository,
        request.resolved ? "resolve review conversation" : "reopen review conversation",
      );
      inspectionCache.clear();
    },
    async prepareWorktree(request) {
      if (!input.git.prepareReviewWorktree) {
        throw new Error("The active Git provider cannot create isolated review worktrees.");
      }
      if (!Number.isSafeInteger(request.number) || request.number <= 0) {
        throw new Error("Review number must be a positive integer.");
      }
      if (!/^[a-f0-9]{7,64}$/i.test(request.expectedHeadSha)) {
        throw new Error("A valid expected review head is required.");
      }
      const current = await capability.inspect({
        repository: request.repository,
        workspace: request.workspace,
        number: request.number,
        refresh: true,
      });
      if (current.summary.headSha !== request.expectedHeadSha) {
        throw new Error(
          "This review changed since it was opened. Refresh it before preparing a worktree.",
        );
      }
      const refNamespace = request.repository.provider === "gitlab" ? "merge-requests" : "pull";
      const result = await input.git.prepareReviewWorktree(
        request.repository.repoRoot,
        request.repository.remoteName,
        `refs/${refNamespace}/${request.number}/head`,
        request.expectedHeadSha,
        `${request.repository.provider}-${request.number}-${request.expectedHeadSha.slice(0, 12)}`,
        request.workspace,
      );
      return { ...result, headSha: request.expectedHeadSha };
    },
  };
  return capability;
}
