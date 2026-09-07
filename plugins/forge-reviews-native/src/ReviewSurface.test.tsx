// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import type {
  ForgeRepository,
  ForgeReviewInspection,
  ForgeReviewsCapability,
} from "@termco/forge-reviews-base";
import type { AiSessionsCapability } from "@termco/ai-sessions-base";
import { TooltipProvider } from "@termco/ui";
import type { UiTabDescriptor, UiTabsRuntime } from "@termco/ui-tabs-base";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ReviewSurface } from "./ReviewSurface";
import { forgeReviewDrafts, reviewDraftKey } from "./drafts";
import { FORGE_REVIEW_TAB_KIND } from "./tabs";

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

const inspection: ForgeReviewInspection = {
  summary: {
    number: 42,
    title: "Review without leaving Termco",
    author: { login: "dev", name: null, avatarUrl: null },
    draft: false,
    updatedAt: null,
    url: "https://github.com/termco/app/pull/42",
    headSha: "abc1234",
    reviewStatus: null,
  },
  body: "A local review workspace.",
  baseRef: "main",
  headRef: "feature/review",
  baseSha: "def5678",
  sourceRepository: "termco/app",
  targetRepository: "termco/app",
  additions: 1,
  deletions: 1,
  mergeStatus: "clean",
  commits: 1,
  checks: [{ name: "test", state: "success", detailsUrl: null }],
  discussions: [],
  files: [
    {
      path: "src/a.ts",
      previousPath: null,
      status: "modified",
      additions: 1,
      deletions: 1,
      patch: [
        "diff --git a/src/a.ts b/src/a.ts",
        "--- a/src/a.ts",
        "+++ b/src/a.ts",
        "@@ -1 +1 @@",
        "-old",
        "+new",
      ].join("\n"),
    },
  ],
};

afterEach(() => {
  cleanup();
  forgeReviewDrafts.clear(
    reviewDraftKey({ host: repository.host, slug: repository.slug, number: 42, headSha: "abc1234" }),
  );
});

describe("ReviewSurface", () => {
  it("uses the full diff width for a newly added file", async () => {
    const addedInspection: ForgeReviewInspection = {
      ...inspection,
      files: [
        {
          ...inspection.files[0],
          status: "added",
          deletions: 0,
          patch: [
            "diff --git a/src/a.ts b/src/a.ts",
            "new file mode 100644",
            "--- /dev/null",
            "+++ b/src/a.ts",
            "@@ -0,0 +1 @@",
            "+new",
          ].join("\n"),
        },
      ],
    };
    const forge = {
      inspect: vi.fn(async () => addedInspection),
    } as unknown as ForgeReviewsCapability;
    const tab: UiTabDescriptor = {
      id: 9,
      rigId: "local",
      kind: FORGE_REVIEW_TAB_KIND,
      title: "PR #42",
      cold: false,
      data: { repository, review: inspection.summary },
    };
    const runtime = {
      workspace: { kind: "local" },
      workspaceForRig: () => ({ kind: "local" }),
    } as unknown as UiTabsRuntime;

    render(
      <TooltipProvider>
        <ReviewSurface
          tabs={[tab]}
          activeId={9}
          surfaceVisible
          runtime={runtime}
          forge={forge}
          sessions={() => undefined}
          desktop={() => undefined}
        />
      </TooltipProvider>,
    );

    expect(await screen.findByText("Head")).toBeVisible();
    expect(screen.queryByText("Base")).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Add comment at src/a.ts:1 (new line)" }),
    ).toBeVisible();
  });

  it("renders the exact revision and publishes only after explicit confirmation", async () => {
    const publishComments = vi.fn(async () => ({
      published: 1,
      headSha: "abc1234",
      remaining: [],
      error: null,
    }));
    const forge: ForgeReviewsCapability = {
      repository: vi.fn(),
      listOpen: vi.fn(),
      inspect: vi.fn(async () => inspection),
      publishComments,
      prepareWorktree: vi.fn(),
    };
    const tab: UiTabDescriptor = {
      id: 9,
      rigId: "local",
      kind: FORGE_REVIEW_TAB_KIND,
      title: "PR #42",
      cold: false,
      data: { repository, review: inspection.summary },
    };
    const runtime = {
      workspace: { kind: "local" },
      workspaceForRig: () => ({ kind: "local" }),
    } as unknown as UiTabsRuntime;
    const startConversation = vi.fn();
    render(
      <TooltipProvider>
        <ReviewSurface
          tabs={[tab]}
          activeId={9}
          surfaceVisible
          runtime={runtime}
          forge={forge}
          sessions={() => ({ startConversation }) as unknown as AiSessionsCapability}
          desktop={() => undefined}
        />
      </TooltipProvider>,
    );

    expect(await screen.findByText("Review without leaving Termco")).toBeVisible();
    expect(screen.getByText("head abc1234")).toBeVisible();
    expect(screen.getByText("base def5678")).toBeVisible();

    fireEvent.click(screen.getByRole("button", { name: "Ask AI" }));
    expect(startConversation).toHaveBeenCalledWith(
      expect.objectContaining({ workspace: { rigId: "local", root: "/repo" } }),
    );

    fireEvent.click(screen.getByRole("button", { name: "Add comment at src/a.ts:1 (new line)" }));
    fireEvent.change(screen.getByPlaceholderText("Leave a clear, actionable comment…"), {
      target: { value: "Please cover this branch." },
    });
    fireEvent.click(screen.getByRole("button", { name: "Add draft" }));
    expect(screen.getAllByText("Please cover this branch.")).toHaveLength(2);
    expect(publishComments).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Submit review · 1" }));
    expect(screen.getByRole("heading", { name: "Submit review" })).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Submit review" }));

    await waitFor(() =>
      expect(publishComments).toHaveBeenCalledWith(
        expect.objectContaining({
          number: 42,
          expectedHeadSha: "abc1234",
          comments: [{ path: "src/a.ts", line: 1, side: "new", body: "Please cover this branch." }],
        }),
      ),
    );
  });

  it("clears the previous review while a different tab loads", async () => {
    const forge: ForgeReviewsCapability = {
      repository: vi.fn(),
      listOpen: vi.fn(),
      inspect: vi.fn(async ({ number }) => {
        if (number === 42) return inspection;
        throw new Error("This review could not be loaded.");
      }),
      publishComments: vi.fn(),
      prepareWorktree: vi.fn(),
    };
    const firstTab: UiTabDescriptor = {
      id: 9,
      rigId: "local",
      kind: FORGE_REVIEW_TAB_KIND,
      title: "PR #42",
      cold: false,
      data: { repository, review: inspection.summary },
    };
    const secondTab: UiTabDescriptor = {
      id: 10,
      rigId: "local",
      kind: FORGE_REVIEW_TAB_KIND,
      title: "PR #43",
      cold: false,
      data: {
        repository,
        review: { ...inspection.summary, number: 43, title: "A different review" },
      },
    };
    const runtime = {
      workspace: { kind: "local" },
      workspaceForRig: () => ({ kind: "local" }),
    } as unknown as UiTabsRuntime;
    const view = render(
      <TooltipProvider>
        <ReviewSurface
          tabs={[firstTab, secondTab]}
          activeId={9}
          surfaceVisible
          runtime={runtime}
          forge={forge}
          sessions={() => undefined}
          desktop={() => undefined}
        />
      </TooltipProvider>,
    );
    expect((await screen.findAllByText("src/a.ts"))[0]).toBeVisible();

    view.rerender(
      <TooltipProvider>
        <ReviewSurface
          tabs={[firstTab, secondTab]}
          activeId={10}
          surfaceVisible
          runtime={runtime}
          forge={forge}
          sessions={() => undefined}
          desktop={() => undefined}
        />
      </TooltipProvider>,
    );

    expect(await screen.findByRole("alert")).toHaveTextContent("This review could not be loaded.");
    expect(screen.queryByText("src/a.ts")).not.toBeInTheDocument();
    expect(screen.getByText("A different review")).toBeVisible();
  });

  it("shows review conversations and keeps replies in a visible local queue", async () => {
    const threadedInspection: ForgeReviewInspection = {
      ...inspection,
      summary: { ...inspection.summary, reviewStatus: "CHANGES_REQUESTED" },
      discussions: [
        {
          id: "321",
          threadId: "321",
          replyToId: "321",
          kind: "comment",
          state: null,
          author: "reviewer",
          body: "Please cover the empty state.",
          createdAt: "2026-09-02T08:30:00.000Z",
          resolved: false,
          resolvable: true,
          path: "src/a.ts",
          line: 1,
          side: "new",
        },
        {
          id: "654",
          threadId: null,
          replyToId: null,
          kind: "system",
          state: null,
          author: "maintainer",
          body: "requested review from reviewer",
          createdAt: "2026-09-02T08:25:00.000Z",
          resolved: false,
          path: null,
          line: null,
        },
      ],
    };
    const publishComments = vi.fn(async () => ({
      published: 1,
      headSha: "abc1234",
      remaining: [],
      error: null,
    }));
    const setThreadResolved = vi.fn(async () => undefined);
    const forge = {
      inspect: vi.fn(async () => threadedInspection),
      publishComments,
      setThreadResolved,
    } as unknown as ForgeReviewsCapability;
    const threadRepository: ForgeRepository = {
      ...repository,
      features: { ...repository.features, resolveThreads: true },
    };
    const tab: UiTabDescriptor = {
      id: 9,
      rigId: "local",
      kind: FORGE_REVIEW_TAB_KIND,
      title: "PR #42",
      cold: false,
      data: { repository: threadRepository, review: inspection.summary },
    };
    const runtime = {
      workspace: { kind: "local" },
      workspaceForRig: () => ({ kind: "local" }),
    } as unknown as UiTabsRuntime;

    render(
      <TooltipProvider>
        <ReviewSurface
          tabs={[tab]}
          activeId={9}
          surfaceVisible
          runtime={runtime}
          forge={forge}
          sessions={() => undefined}
          desktop={() => undefined}
        />
      </TooltipProvider>,
    );

    const inlineThread = await screen.findByRole("article", {
      name: "Review conversation at src/a.ts:1",
    });
    expect(inlineThread).toHaveTextContent("Please cover the empty state.");
    expect(inlineThread).toHaveTextContent("Open");
    fireEvent.click(screen.getByRole("button", { name: "Resolve" }));
    await waitFor(() =>
      expect(setThreadResolved).toHaveBeenCalledWith(
        expect.objectContaining({ number: 42, threadId: "321", resolved: true }),
      ),
    );

    fireEvent.mouseDown(await screen.findByRole("tab", { name: "Conversations 1" }), { button: 0 });
    expect(screen.getByText("Please cover the empty state.")).toBeVisible();
    expect(screen.queryByText("requested review from reviewer")).not.toBeInTheDocument();
    expect(screen.getByText("Open")).toBeVisible();
    expect(screen.getAllByRole("button", { name: "Reply" })).toHaveLength(1);
    fireEvent.click(screen.getByRole("button", { name: "Reply" }));
    fireEvent.change(screen.getByPlaceholderText("Leave a clear, actionable comment…"), {
      target: { value: "Added coverage for it." },
    });
    fireEvent.click(screen.getByRole("button", { name: "Add draft" }));

    expect(screen.getByRole("complementary", { name: "Local review queue" })).toBeVisible();
    expect(screen.getByText("Reply to @reviewer")).toBeVisible();
    expect(screen.getByText(/Draft 1 ·/)).toBeVisible();
    expect(publishComments).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Submit review · 1" }));
    fireEvent.click(screen.getByRole("button", { name: "Submit review" }));
    await waitFor(() =>
      expect(publishComments).toHaveBeenCalledWith(
        expect.objectContaining({
          comments: [
            expect.objectContaining({
              body: "Added coverage for it.",
              replyToId: "321",
              replyToAuthor: "reviewer",
            }),
          ],
        }),
      ),
    );

    fireEvent.mouseDown(screen.getByRole("tab", { name: "History 1" }), { button: 0 });
    expect(screen.getByText("requested review from reviewer")).toBeVisible();
  });
});

it("retries the chosen outcome and summary after a partially published reply", async () => {
  const key = reviewDraftKey({ host: repository.host, slug: repository.slug, number: 42, headSha: "abc1234" });
  const first = forgeReviewDrafts.add(key, { path: null, line: null, side: null, body: "First reply", replyToId: "123" });
  const second = forgeReviewDrafts.add(key, { path: null, line: null, side: null, body: "Second reply", replyToId: "456" });
  const submitReview = vi.fn()
    .mockResolvedValueOnce({ published: 1, headSha: "abc1234", remaining: [second], error: "Network failure", outcome: "approve", outcomeSubmitted: false, summarySubmitted: false })
    .mockResolvedValueOnce({ published: 1, headSha: "abc1234", remaining: [], error: null, outcome: "approve", outcomeSubmitted: true, summarySubmitted: true });
  const publishComments = vi.fn();
  const tab: UiTabDescriptor = { id: 9, rigId: "local", kind: FORGE_REVIEW_TAB_KIND, title: "PR #42", cold: false, data: { repository, review: inspection.summary } };
  render(<TooltipProvider><ReviewSurface tabs={[tab]} activeId={9} surfaceVisible
    runtime={{ workspace: { kind: "local" }, workspaceForRig: () => ({ kind: "local" }) } as unknown as UiTabsRuntime}
    forge={{ inspect: async () => inspection, submitReview, publishComments } as unknown as ForgeReviewsCapability}
    sessions={() => undefined} desktop={() => undefined} /></TooltipProvider>);
  await screen.findByText("head abc1234");
  fireEvent.click(screen.getByRole("button", { name: "Submit review · 2" }));
  fireEvent.click(screen.getByRole("button", { name: "Approve" }));
  fireEvent.change(screen.getByLabelText(/Review summary/), { target: { value: "Looks good." } });
  fireEvent.click(screen.getAllByRole("button", { name: "Approve" }).at(-1)!);
  await screen.findByText(/Network failure/);
  expect(forgeReviewDrafts.snapshot(key)).toEqual([second]);
  expect(forgeReviewDrafts.snapshot(key)[0].createdAt).toBe(second.createdAt);
  fireEvent.click(screen.getByRole("button", { name: "Retry review" }));
  await waitFor(() => expect(submitReview).toHaveBeenCalledTimes(2));
  expect(submitReview.mock.calls[1][0]).toMatchObject({ outcome: "approve", summary: "Looks good.", comments: [expect.objectContaining({ body: "Second reply" })] });
  expect(publishComments).not.toHaveBeenCalled();
  expect(forgeReviewDrafts.snapshot(key)).not.toContain(first);
});

it("preserves new AI drafts added while an earlier queue is publishing", () => {
  const key = "concurrent-test";
  const first = forgeReviewDrafts.add(key, { path: null, line: null, side: null, body: "Confirmed" });
  const later = forgeReviewDrafts.add(key, { path: null, line: null, side: null, body: "New finding" });
  forgeReviewDrafts.reconcile(key, [first], []);
  expect(forgeReviewDrafts.snapshot(key)).toEqual([later]);
  forgeReviewDrafts.clear(key);
});

it("publishes the previewed snapshot while preserving drafts arriving after confirmation opens", async () => {
  const key = reviewDraftKey({ host: repository.host, slug: repository.slug, number: 42, headSha: "abc1234" });
  forgeReviewDrafts.add(key, { path: null, line: null, side: null, body: "Confirmed comment" });
  const publishComments = vi.fn(async (_input: unknown) => ({ published: 1, headSha: "abc1234", remaining: [], error: null }));
  const tab: UiTabDescriptor = { id: 9, rigId: "local", kind: FORGE_REVIEW_TAB_KIND, title: "PR #42", cold: false, data: { repository, review: inspection.summary } };
  render(<TooltipProvider><ReviewSurface tabs={[tab]} activeId={9} surfaceVisible
    runtime={{ workspace: { kind: "local" }, workspaceForRig: () => ({ kind: "local" }) } as unknown as UiTabsRuntime}
    forge={{ inspect: async () => inspection, publishComments } as unknown as ForgeReviewsCapability}
    sessions={() => undefined} desktop={() => undefined} /></TooltipProvider>);
  await screen.findByText("head abc1234");
  fireEvent.click(screen.getByRole("button", { name: "Submit review · 1" }));
  expect(screen.getByRole("list", { name: "Comments to publish" })).toHaveTextContent("Confirmed comment");
  act(() => { forgeReviewDrafts.add(key, { path: null, line: null, side: null, body: "Arrived later" }); });
  expect(screen.getByRole("list", { name: "Comments to publish" })).not.toHaveTextContent("Arrived later");
  fireEvent.click(screen.getByRole("button", { name: "Submit review" }));
  await waitFor(() => expect(publishComments).toHaveBeenCalledOnce());
  expect(publishComments.mock.calls[0][0]).toMatchObject({ comments: [expect.objectContaining({ body: "Confirmed comment" })] });
  await waitFor(() => expect(forgeReviewDrafts.snapshot(key).map((draft) => draft.body)).toEqual(["Arrived later"]));
});

it("visits every open conversation in the same file", async () => {
  const visited: string[] = [];
  const previous = Element.prototype.scrollIntoView;
  Element.prototype.scrollIntoView = function () { visited.push(this.id); };
  try {
    const threaded: ForgeReviewInspection = {
      ...inspection,
      files: [{ ...inspection.files[0], patch: "@@ -1,2 +1,2 @@\n-old\n+new\n context" }],
      discussions: [1, 2].map((line) => ({ id: String(line), threadId: `thread-${line}`, replyToId: String(line), kind: "comment", state: null, author: "dev", body: `Feedback ${line}`, createdAt: null, resolved: false, resolvable: true, path: "src/a.ts", line, side: "new" })),
    };
    const tab: UiTabDescriptor = { id: 9, rigId: "local", kind: FORGE_REVIEW_TAB_KIND, title: "PR #42", cold: false, data: { repository, review: inspection.summary } };
    render(<TooltipProvider><ReviewSurface tabs={[tab]} activeId={9} surfaceVisible
      runtime={{ workspace: { kind: "local" }, workspaceForRig: () => ({ kind: "local" }) } as unknown as UiTabsRuntime}
      forge={{ inspect: async () => threaded } as unknown as ForgeReviewsCapability}
      sessions={() => undefined} desktop={() => undefined} /></TooltipProvider>);
    await screen.findByText("head abc1234");
    fireEvent.click(screen.getByRole("button", { name: "Next open 2" }));
    fireEvent.click(screen.getByRole("button", { name: "Next open 2" }));
    expect(visited).toEqual(["review-line-new-1", "review-line-new-2"]);
  } finally { Element.prototype.scrollIntoView = previous; }
});

it("adapts a narrow diff without losing base-side conversations and respects a manual layout", async () => {
  let resize: (entries: { contentRect: { width: number } }[]) => void = () => {};
  vi.stubGlobal("ResizeObserver", class {
    constructor(callback: typeof resize) { resize = callback; }
    observe() {}
    disconnect() {}
  });
  try {
    const threaded: ForgeReviewInspection = {
      ...inspection,
      files: [{ ...inspection.files[0], patch: "@@ -10,2 +20,2 @@\n-old\n+new\n context" }],
      discussions: [{ id: "base-feedback", threadId: "base-thread", replyToId: "base-feedback", kind: "comment", state: null, author: "dev", body: "Keep this base-side feedback visible", createdAt: null, resolved: false, path: "src/a.ts", line: 11, side: "old" }],
    };
    const tab: UiTabDescriptor = { id: 9, rigId: "local", kind: FORGE_REVIEW_TAB_KIND, title: "PR #42", cold: false, data: { repository, review: inspection.summary } };
    render(<TooltipProvider><ReviewSurface tabs={[tab]} activeId={9} surfaceVisible
      runtime={{ workspace: { kind: "local" }, workspaceForRig: () => ({ kind: "local" }) } as unknown as UiTabsRuntime}
      forge={{ inspect: async () => threaded } as unknown as ForgeReviewsCapability}
      sessions={() => undefined} desktop={() => undefined} /></TooltipProvider>);
    await screen.findByText("head abc1234");
    act(() => resize([{ contentRect: { width: 500 } }]));
    expect(screen.getByText("Base → Head")).toBeVisible();
    expect(screen.getByText("Keep this base-side feedback visible")).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Hide changed files" }));
    expect(screen.queryByRole("navigation", { name: "Changed files" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Show changed files" }));
    expect(screen.getByRole("navigation", { name: "Changed files" })).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Split" }));
    act(() => resize([{ contentRect: { width: 400 } }]));
    expect(screen.getByText("Base", { exact: true })).toBeVisible();
    expect(screen.getByText("Head", { exact: true })).toBeVisible();
    expect(screen.getByText("Keep this base-side feedback visible")).toBeVisible();
  } finally { vi.unstubAllGlobals(); }
});

it("keeps older-head drafts visible after refresh and only moves feedback by deliberate action", async () => {
  const oldKey = reviewDraftKey({ host: repository.host, slug: repository.slug, number: 42, headSha: "abc1234" });
  const newKey = reviewDraftKey({ host: repository.host, slug: repository.slug, number: 42, headSha: "new5678" });
  const old = forgeReviewDrafts.add(oldKey, { body: "Please cover this edge case", path: "src/a.ts", line: 1, side: "new" });
  const inspect = vi.fn().mockResolvedValue(inspection);
  const tab = { id: 9, rigId: "local", kind: FORGE_REVIEW_TAB_KIND, title: "PR #42", cold: false, data: { repository, review: inspection.summary } } as UiTabDescriptor;
  const runtime = { workspace: { kind: "local" }, workspaceForRig: () => ({ kind: "local" }) } as unknown as UiTabsRuntime;
  render(<TooltipProvider><ReviewSurface tabs={[tab]} activeId={9} surfaceVisible runtime={runtime} forge={{ inspect } as unknown as ForgeReviewsCapability} sessions={() => undefined} desktop={() => undefined} /></TooltipProvider>);
  await screen.findByText("Head");
  inspect.mockResolvedValue({ ...inspection, summary: { ...inspection.summary, headSha: "new5678" } });
  fireEvent.click(screen.getByRole("button", { name: "Refresh review" }));
  expect(await screen.findByText(/draft from an earlier revision/i)).toBeVisible();
  expect(screen.getByDisplayValue(old.body)).toBeVisible();
  expect(forgeReviewDrafts.snapshot(newKey)).toHaveLength(0);
  fireEvent.click(screen.getByRole("button", { name: "Use as overall comment" }));
  expect(forgeReviewDrafts.snapshot(oldKey)).toHaveLength(0);
  expect(forgeReviewDrafts.snapshot(newKey)).toEqual([expect.objectContaining({ body: old.body })]);
  expect(forgeReviewDrafts.snapshot(newKey)[0].path).toBeNull();
  forgeReviewDrafts.clear(newKey);
});
