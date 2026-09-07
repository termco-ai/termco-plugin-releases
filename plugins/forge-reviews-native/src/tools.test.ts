import type {
  ForgeRepository,
  ForgeReviewInspection,
  ForgeReviewsCapability,
} from "@termco/forge-reviews-base";
import { describe, expect, it, vi } from "vitest";
import { forgeReviewDrafts, reviewDraftKey } from "./drafts";
import { buildForgeReviewTools } from "./tools";

const repository: ForgeRepository = {
  provider: "github",
  providerLabel: "GitHub",
  cli: "gh",
  host: "github.com",
  slug: "termco/app",
  repoRoot: "/repo",
  remoteUrl: "git@github.com:termco/app.git",
  remoteName: "origin",
  reviewNoun: "pull request",
  features: { approve: true, requestChanges: true, inlineComments: true, resolveThreads: false },
};

function capability(): ForgeReviewsCapability {
  return {
    repository: vi.fn(async () => ({ kind: "ready" as const, repository })),
    listOpen: vi.fn(async () => ({ reviews: [], truncated: false })),
    inspect: vi.fn(async (): Promise<ForgeReviewInspection> => ({
      summary: {
        number: 42,
        title: "Review",
        author: { login: "dev", name: null, avatarUrl: null },
        draft: false,
        updatedAt: null,
        url: "https://github.com/termco/app/pull/42",
        headSha: "abc1234",
        reviewStatus: null,
      },
      body: "",
      baseRef: "main",
      headRef: "feature",
      baseSha: "def5678",
      sourceRepository: "termco/app",
      targetRepository: "termco/app",
      additions: 1,
      deletions: 0,
      mergeStatus: "clean",
      commits: 1,
      checks: [],
      discussions: [],
      files: [
        {
          path: "src/a.ts",
          previousPath: null,
          status: "modified",
          additions: 1,
          deletions: 0,
          patch: "+new",
        },
      ],
    })),
    publishComments: vi.fn(),
    prepareWorktree: vi.fn(),
  };
}

describe("forge review AI tools", () => {
  it("creates a local exact-head draft without publishing it", async () => {
    const forge = capability();
    const tools = buildForgeReviewTools(forge, {
      getCwd: () => "/repo",
      getWorkspaceRoot: () => "/repo",
      getWorkspaceEnv: () => ({ kind: "local" }),
    });
    const result = await tools.forge_review_create_draft?.execute?.({
      number: 42,
      headSha: "abc1234",
      path: "src/a.ts",
      line: 1,
      side: "new",
      body: "Please add coverage.",
    });
    const key = reviewDraftKey({
      host: "github.com",
      slug: "termco/app",
      number: 42,
      headSha: "abc1234",
    });

    expect(result).toMatchObject({ created: true, published: false, headSha: "abc1234" });
    expect(forgeReviewDrafts.snapshot(key)).toEqual([
      expect.objectContaining({ path: "src/a.ts", line: 1, body: "Please add coverage." }),
    ]);
    expect(forge.publishComments).not.toHaveBeenCalled();
    forgeReviewDrafts.clear(key);
  });

  it("requires approval and moves only the AI workspace into the isolated worktree", async () => {
    const forge = capability();
    vi.mocked(forge.prepareWorktree).mockResolvedValue({
      path: "/repo/.git/termco-review-worktrees/github-42-abc1234",
      reused: false,
      headSha: "abc1234",
    });
    const setWorkspaceFolder = vi.fn();
    const tools = buildForgeReviewTools(forge, {
      getCwd: () => "/repo",
      getWorkspaceRoot: () => "/repo",
      getWorkspaceEnv: () => ({ kind: "local" }),
      setWorkspaceFolder,
    });

    expect(tools.forge_review_prepare_worktree?.alwaysNeedsApproval).toBe(true);
    await tools.forge_review_prepare_worktree?.execute?.({ number: 42, headSha: "abc1234" });
    expect(forge.prepareWorktree).toHaveBeenCalledWith(
      expect.objectContaining({
        number: 42,
        expectedHeadSha: "abc1234",
      }),
    );
    expect(setWorkspaceFolder).toHaveBeenCalledWith(
      "/repo/.git/termco-review-worktrees/github-42-abc1234",
    );
  });

  it("creates, edits, lists, and deletes a local reply draft for a provider conversation", async () => {
    const forge = capability();
    const baseInspection = await forge.inspect({
      repository,
      workspace: { kind: "local" },
      number: 42,
    });
    vi.mocked(forge.inspect).mockResolvedValue({
      ...baseInspection,
      discussions: [
        {
          id: "99",
          threadId: "thread-1234",
          replyToId: "99",
          kind: "comment",
          state: null,
          author: "reviewer",
          body: "Please add coverage.",
          createdAt: "2026-09-02T08:30:00Z",
          resolved: false,
          resolvable: true,
          path: "src/a.ts",
          line: 1,
          side: "new",
        },
      ],
    });
    const tools = buildForgeReviewTools(forge, {
      getCwd: () => "/repo",
      getWorkspaceRoot: () => "/repo",
      getWorkspaceEnv: () => ({ kind: "local" }),
    });
    const created = (await tools.forge_review_create_reply_draft?.execute?.({
      number: 42,
      headSha: "abc1234",
      conversationId: "thread-1234",
      body: "Covered now.",
    })) as { draftId: string };
    expect(created).toMatchObject({ published: false, replyTo: "reviewer" });

    await tools.forge_review_update_draft?.execute?.({
      number: 42,
      headSha: "abc1234",
      draftId: created.draftId,
      body: "Covered with a regression test.",
    });
    await expect(
      tools.forge_review_list_drafts?.execute?.({ number: 42, headSha: "abc1234" }),
    ).resolves.toMatchObject({
      drafts: [
        expect.objectContaining({
          replyToId: "99",
          replyToAuthor: "reviewer",
          body: "Covered with a regression test.",
        }),
      ],
    });
    await tools.forge_review_delete_draft?.execute?.({
      number: 42,
      headSha: "abc1234",
      draftId: created.draftId,
    });
    await expect(
      tools.forge_review_list_drafts?.execute?.({ number: 42, headSha: "abc1234" }),
    ).resolves.toMatchObject({ drafts: [] });
  });
});
