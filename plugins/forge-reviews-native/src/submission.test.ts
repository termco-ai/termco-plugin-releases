// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import type {
  ForgeRepository,
  ForgeReviewInspection,
  ForgeReviewSubmitRequest,
} from "@termco/forge-reviews-base";
import type { GitCapability } from "@termco/git-base";
import { createForgeReviewsCapability } from "./provider";
import type { ForgeCommand, ForgeCommandOutput } from "./runner";

const ok = (stdout = "{}"): ForgeCommandOutput => ({
  stdout,
  stderr: "",
  exitCode: 0,
  timedOut: false,
  truncated: false,
  notFound: false,
});
const repository: ForgeRepository = {
  provider: "gitlab",
  providerLabel: "GitLab",
  cli: "glab",
  host: "gitlab.com",
  slug: "team/app",
  repoRoot: "/repo",
  remoteUrl: "https://gitlab.com/team/app.git",
  remoteName: "origin",
  reviewNoun: "merge request",
  features: {
    approve: true,
    requestChanges: false,
    inlineComments: true,
    resolveThreads: true,
  },
};
const review: ForgeReviewInspection = {
  summary: {
    number: 7,
    title: "Rename",
    author: { login: "dev", name: null, avatarUrl: null },
    draft: false,
    updatedAt: null,
    url: "",
    headSha: "abc1234",
    reviewStatus: null,
  },
  body: "",
  baseRef: "main",
  headRef: "feature",
  baseSha: "def5678",
  startSha: "fed7654",
  sourceRepository: "team/app",
  targetRepository: "team/app",
  additions: 1,
  deletions: 1,
  mergeStatus: null,
  commits: 1,
  checks: [],
  discussions: [],
  files: [
    {
      path: "new.ts",
      previousPath: "old.ts",
      status: "renamed",
      additions: 1,
      deletions: 1,
      patch: "@@ -1,2 +1,2 @@\n-old\n+new\n context",
    },
  ],
};
const first = { path: "new.ts", line: 1, side: "new" as const, body: "First" };
const second = { path: null, line: null, side: null, body: "Second" };
const request: ForgeReviewSubmitRequest = {
  repository,
  workspace: { kind: "local" },
  number: 7,
  expectedHeadSha: "abc1234",
  outcome: "approve",
  summary: "Summary",
  comments: [first, second],
};

function setup(
  handler: (command: ForgeCommand) => ForgeCommandOutput = () => ok(),
) {
  const run = vi.fn(async (command: ForgeCommand) => handler(command));
  const git = {
    status: async () => ({ upstream: "origin/main" }),
    remoteUrl: async () =>
      "https://oauth2:example-secret@gitlab.com/team/app.git",
  } as unknown as GitCapability;
  const forge = createForgeReviewsCapability({
    git,
    runner: { run, clearExecutableCache() {} },
  });
  vi.spyOn(forge, "inspect").mockResolvedValue(review);
  return { forge, run };
}

describe("review submission regressions", () => {
  it("removes embedded credentials from public repository data and CLI targets", async () => {
    const { forge, run } = setup();
    const result = await forge.repository({
      repoRoot: "/repo",
      workspace: { kind: "local" },
    });
    expect(result).toMatchObject({
      kind: "ready",
      repository: { remoteUrl: repository.remoteUrl },
    });
    expect(JSON.stringify([result, run.mock.calls])).not.toContain(
      "example-secret",
    );
  });

  it("publishes only the confirmed GitLab comments with correct renamed-file positions", async () => {
    const { forge, run } = setup();
    await forge.submitReview!(request);
    expect(
      run.mock.calls.some(([command]) =>
        command.args.some((arg) => arg.includes("draft_notes")),
      ),
    ).toBe(false);
    const comment = run.mock.calls
      .map(([command]) => command)
      .find((command) => command.stdin?.includes("First"));
    expect(comment).toBeDefined();
    expect(JSON.parse(comment!.stdin!)).toMatchObject({
      body: "First",
      position: { old_path: "old.ts", new_path: "new.ts", new_line: 1 },
    });
  });

  it("returns only unsent comments after failure, so retry cannot duplicate earlier comments", async () => {
    let fail = true;
    const { forge, run } = setup((command) => {
      if (command.stdin?.includes("Second") && fail)
        return { ...ok(), exitCode: 1 };
      return ok();
    });
    const result = await forge.submitReview!(request);
    expect(result).toMatchObject({
      published: 1,
      remaining: [second],
      outcomeSubmitted: false,
      summarySubmitted: false,
    });
    expect(result.error).toBeTruthy();
    fail = false;
    await forge.submitReview!({ ...request, comments: result.remaining });
    expect(
      run.mock.calls.filter(([command]) => command.stdin?.includes("First")),
    ).toHaveLength(1);
  });

  it("keeps a failed approval retryable without resending successful comments or summary", async () => {
    const { forge } = setup((command) =>
      command.args.includes("approve") ? { ...ok(), exitCode: 1 } : ok(),
    );
    const result = await forge.submitReview!(request);
    expect(result).toMatchObject({
      published: 2,
      remaining: [],
      outcomeSubmitted: false,
      summarySubmitted: true,
    });
    expect(result.error).toBeTruthy();
  });

  it("does not claim a GitHub outcome was submitted when only a reply succeeded", async () => {
    const { forge } = setup((command) =>
      command.args.some((arg) => arg.endsWith("/222/replies"))
        ? { ...ok(), exitCode: 1 }
        : ok(),
    );
    const replies = [
      { ...second, replyToId: "111" },
      { ...second, replyToId: "222" },
    ];
    const result = await forge.submitReview!({
      ...request,
      repository: { ...repository, provider: "github", cli: "gh" },
      comments: replies,
    });
    expect(result).toMatchObject({
      published: 1,
      remaining: [replies[1]],
      outcomeSubmitted: false,
      summarySubmitted: false,
    });
  });
});
